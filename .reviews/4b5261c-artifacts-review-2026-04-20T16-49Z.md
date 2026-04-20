# Adversarial Review: Command Artifact Inbox

**Date**: 2026-04-20T16:49Z  
**Reviewer**: Claude (general-purpose agent, adversarial review mode)  
**Note**: Codex blocked by EROFS (models cache write-fail in this session context); Claude used as fallback per adversarial review gate guidance.  
**Target**: `src/lib/artifacts.ts`, `src/app/artifacts/page.tsx`, `src/app/artifacts/[source]/[...path]/page.tsx`, `supervisor/decisions/0028-command-artifact-inbox-read-contract.md`  
**Commit**: `4b5261c`

---

## 1. Most dangerous assumption

`artifacts.ts:82` — the check `resolved.startsWith(rootReal + sep)` assumes `realpathSync()` is atomic. Between calling it and the `startsWith` check, a symlink or bind mount created by concurrent code could alter what file actually gets read, invalidating the resolved-path assertion. On a multi-agent workspace where other processes write to `runtime/research/`, this is a TOCTOU window.

**Verdict on risk**: Accepted tradeoff. This is a trusted single-user environment. Only principal-controlled agents write to `runtime/research/`. An adversarial write to that directory is a deeper compromise than this attack surface. No fix required for V1.

## 2. Missing failure mode

`artifacts.ts:165–182` — the frontmatter parser has no size limit on keys or values. A `.md` file with thousands of key-value pairs (e.g., from a compromised synthesis script) would exhaust heap on parse and serialize the entire `frontmatter` object into React props. DoS vector for a compromised agent.

**Verdict on risk**: Accepted tradeoff. Requires a compromised workspace agent as a precondition. Out-of-scope for V1. Worth noting for future hardening if the write surface expands.

## 3. Boundary most likely to be collapsed in practice

`page.tsx (list view):59–62` — each segment of `entry.relativePath` is encoded with `encodeURIComponent()`. If a future CDN or firewall decodes percent-encoded slashes in paths (e.g., `%2F` → `/`), a filename containing a literal slash would generate a URL that bypasses the flat-pattern allowlist for `syntheses`. The `cross-cutting-*.md` pattern check happens per-segment; a decoded `/` would split the segment and escape the single-segment assertion (`if (segments.length !== 1) return null`).

**Verdict on risk**: Theoretical. Cloudflare Tunnel does not normalize `%2F` in path segments by default. No `.md` files in the current source roots contain literal slashes in their names. Document as a contract: source roots must not contain files with literal slashes in their names.

## 4. Path traversal analysis

The guard chain in `validateRelativePath()` (`artifacts.ts:65–71`) and `resolveSafe()` (`artifacts.ts:73–86`) is sound under all tested scenarios:

- `..` segments: blocked at `segmentIsSafe()` line 57
- Null bytes: blocked at line 59
- Path separators in segments: blocked at line 60
- Segments starting with `-`: blocked at line 61
- Non-`.md` extension: blocked at line 69
- `flat-pattern` bypass: `readArtifact()` re-checks `source.pattern.test(segments[0])` at line 193 after segment validation

**No traversal bypass found.** The only latent risk is a future developer adding a source with `mode: 'flat-pattern'` and no `pattern` field — line 192 short-circuits to `return null` on missing pattern, making it safe, but the intent would be violated silently. Recommendation: add a TypeScript discriminated union to make `pattern` required when `mode === 'flat-pattern'`.

---

## Overall verdict

**The path-traversal guard is sound.** `segmentIsSafe()` + `validateRelativePath()` + `realpathSync()` with sep-bounded prefix check form a tight defense with no identified bypass. The design rests on the assumption that `realpathSync()` is not race-conditioned — acceptable in a trusted single-user workspace. Findings are accepted tradeoffs or out-of-scope for V1; no blocking issues found. ADR-0028 is ready for promotion from `proposed → accepted`.
