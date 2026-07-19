---
type: adversarial-review
reviewer: claude-sonnet-4-6
subject: command observatory module
files:
  - src/lib/observatory.ts (306 lines)
  - src/components/ObservatoryDashboard.tsx (64 lines)
  - scripts/observatory-test.ts (70 lines)
reviewed-at: 2026-07-14T18:00Z
verdict: ship-with-fixes
note: written to projects/command/.reviews/ because supervisor/ is read-only in sandbox
---

# Adversarial Review: Command Observatory Module

## Framing

This is a private operator surface — single authenticated owner, JWT-gated, no public access.
That context makes several things that would be bugs elsewhere into acceptable tradeoffs. It is
noted explicitly where that applies rather than used as a blanket excuse.

---

## Finding 1 — REAL BUG: `readTail` throws on stat failure; exported without documented contract

`readTail` calls `statSync(path)` with no guard. The call site in `collectTelemetry` (line 273)
first checks `existsSync(path)`, so there is a window:

1. File exists, `existsSync` returns true
2. Rotation/deletion occurs between the check and `statSync`
3. `statSync` throws ENOENT

For collectors wrapped in `safe()`, the synchronous throw inside `timed()`'s `.then(task)`
is caught as a rejected Promise and surfaces in `collectorErrors`. So the observatory itself
is protected. However, `readTail` is exported (used directly in tests) with no `@throws`
documentation. Any caller outside the `safe()` wrapper gets an uncaught ENOENT.

**Verdict**: Low risk in current context. Acceptable tradeoff given the export is internal.
Recommendation: add a `@throws` JSDoc or handle the ENOENT inside `readTail`.

---

## Finding 2 — SOFT BUG: Module-level cache has no concurrency guard

```ts
let cached: { expires: number; snapshot: ObservatorySnapshot } | null = null
```

Two concurrent requests arriving before the first snapshot completes will both find
`cached === null`, both run all collectors, and both write to `cached`. Last write wins.
No data corruption — both snapshots are equivalent given the same source state — but both
incur full collection cost. At SNAPSHOT_TTL_MS = 15s, contention is bounded to one
thundering-herd window every 15 seconds.

**Verdict**: Acceptable tradeoff given single-user context. A mutex or in-flight deduplication
would fix it but adds complexity not justified here.

---

## Finding 3 — CORRECTNESS: `containsPrivateProjectionField` is redundant and gives false security confidence

The private-key scan (line 184) runs BEFORE `validateProjectionV1` (line 185). After
`validateProjectionV1` passes, the structure is exact — no unknown keys survive the
`hasExactKeys` enforcement. The scan only meaningfully catches private keys on structurally
invalid documents that `validateProjectionV1` would reject anyway.

Additionally, the blocklist is exact-match only:
```ts
const PRIVATE_KEYS = /^(transcript|prompt|content|body|secret|password|token|cookie|authorization|localPath|rawTelemetry)$/i
```

`accessToken`, `apiKey`, `bearerToken`, `privateKey`, `signingKey`, `sessionToken`, `refreshToken`
all pass undetected. In a single-user authenticated context this is not an attack vector
(the attacker would need write access to the projection file, at which point they have
the host). But it gives false confidence.

**Verdict**: Not a ship-blocker. Document that this is pre-validation belt-and-suspenders only,
not a security boundary. The real protection is schema exactness.

---

## Finding 4 — RELIABILITY: `readBounded` has a TOCTOU race on large files

```ts
function readBounded(path: string, maxBytes = MAX_TEXT_BYTES): string {
  if (statSync(path).size > maxBytes) throw new Error(`source exceeds ${maxBytes} byte hot-path limit`)
  return readFileSync(path, 'utf8')
}
```

Between `statSync` and `readFileSync`, an atomic file replace can grow the file past `maxBytes`
without the guard firing. The public projection cap is 1 MB — not enough to OOM a 4 GB server,
but enough for a noticeable heap spike.

**Verdict**: Real bug, low urgency. Document the TOCTOU and accept it, or read with an explicit
byte cap instead.

---

## Finding 5 — RELIABILITY: `timed()` does not interrupt synchronous collectors

`timed()` uses `Promise.race` with a setTimeout. A sync collector like `collectRecentChanges`
(which calls `readdirSync` + multiple `statSync` calls in a loop) blocks the event loop
during its execution. `Promise.race` cannot interrupt a running synchronous call — the
timeout fires only after the sync block completes. If the `/opt/workspace/projects` directory
ever becomes an NFS or FUSE mount under load, `readdirSync` could stall for multiple seconds
and the observatory would block the entire request despite the timeout.

**Verdict**: Acceptable given local ext4 filesystem. Document the limitation inline.

---

## Finding 6 — INEFFICIENCY: `collectRecentChanges` calls `statSync` twice per entry

```ts
if (existsSync(path) && statSync(path).isFile()) files.push({ path, mtimeMs: statSync(path).mtimeMs })
```

Three filesystem calls per entry: `existsSync`, `statSync().isFile()`, `statSync().mtimeMs`.
A single `try { const s = statSync(path); if (s.isFile()) files.push(...) } catch {}` would
cover all three with one syscall and eliminate the TOCTOU between second and third.

**Verdict**: Minor cleanup, not a ship-blocker.

---

## Finding 7 — CORRECTNESS: `frontMatter` regex assumes Unix line endings

```ts
const match = text.match(/^---\n([\s\S]*?)\n---/)
```

CRLF files fail silently — returns `{}`. On this Linux server with `core.autocrlf=false`,
all checked-in files should have LF. Low risk but silent.

**Verdict**: Document and accept.

---

## Finding 8 — UX GAP: `postureReason` is generic even when a specific signal is the cause

Line 333 includes `ownerQueue.decisions` (individual blocked items) in `allSignals`. When a
pending owner decision drives posture to `blocked`, the displayed reason is:

> "At least one bounded source reports a blocked transition."

The operator sees `blocked` but must scroll to the owner queue section to understand why. The
generic reason from `derivePosture` discards the specificity of the causing signal.

**Verdict**: Design tradeoff. Acceptable. Recommend: in `getObservatorySnapshot`, after calling
`derivePosture`, find the first signal with `.state === posture.posture` and append its `reason`
to `postureReason`.

---

## Finding 9 — TEST GAP: Fixture mechanism uses `status: 'operational'` — undocumented in validator

In `makeFreshProjection()`:
```ts
{ id: 'mechanism:fixture', title: 'Fixture mechanism', summary: 'Typed fixture.', status: 'operational', public_artifact: '/method/#fixture' }
```

`validateProjectionV1` does not constrain mechanism status values — it only checks that required
string fields are non-empty. The `statuses` Set (`['active', 'blocked', 'completed', 'invalidated',
'withdrawn', 'superseded']`) is applied to research only. So `'operational'` passes — correctly.

But the fixture uses an undocumented status value, creating an implicit expectation that
`'operational'` is a valid mechanism status. A future v2 validator adding mechanism status
constraints would break this fixture without obvious explanation.

**Verdict**: Low risk now, maintenance hazard later. Add a comment explaining mechanism status
is intentionally unconstrained in v1.

---

## Finding 10 — REAL BUG IN TESTS: Contamination test does not isolate which guard fires

Lines 99–103:
```ts
const contaminated = { ...freshProjection, research: [{ ...(freshProjection.research as Array<Record<string, unknown>>)[0], transcript: 'private' }] }
writeFileSync(join(projectionRoot, 'projection.json'), JSON.stringify(contaminated))
const rejected = await getObservatorySnapshot({ bypassCache: true })
assert.equal(rejected.publicProjection.availability, 'unknown')
```

The contaminated projection is NOT re-signed after adding `transcript`. So the test fires
`containsPrivateProjectionField` — good — but it also would have failed the digest check
anyway. The test does not verify that a **signed contaminated** projection is rejected.

An adversarial mutation: sign the contaminated projection with `resign()`, write it, and verify
rejection. If `containsPrivateProjectionField` is ever removed or reordered, this test would
fail to catch the regression because the digest check would also catch the tampering. The test
validates rejection, not the mechanism that causes it.

**Verdict**: Real test gap. Must fix: add a test case with `resign(contaminated)` that verifies
rejection is specifically from `containsPrivateProjectionField`, not the digest.

---

## Finding 11 — TEST GAP: No test for snapshot caching behavior

The `SNAPSHOT_TTL_MS = 15_000` cache is central to request performance, but all tests use
`bypassCache: true`. There is no test that:
- Verifies a second call within TTL returns the cached snapshot (same `generatedAt`)
- Verifies that a call after TTL expiry re-collects

A future refactor that accidentally clears or never sets the cache would go undetected.

**Verdict**: Test gap, low urgency. Add one cache-hit and one cache-miss test.

---

## Finding 12 — SECURITY (CONTAINED): `sourceRef` exposes absolute filesystem paths in rendered UI

Signals include `sourceRef` fields like:
```
/opt/workspace/runtime/.telemetry/events.jsonl#tail-512000
/opt/workspace/projects/synaplex/knowledge/projection.json
/opt/workspace/runtime/.owner-decisions/queue.json
```

These render verbatim in `ObservatoryDashboard.tsx`:
```tsx
<dd className="inline break-all font-mono">{item.sourceRef}</dd>
```

This reveals the server's filesystem layout and the location of sensitive operational files.
Acceptable for a private single-user dashboard where the owner already knows the layout. Becomes
a real issue if the snapshot is ever exposed via an unauthenticated API endpoint or serialized
to a third-party log.

**Verdict**: Acceptable now. Document the scope boundary. If a `/api/observatory` route is ever
added, path sanitization must be applied before that route ships.

---

## Finding 13 — REAL BUG: `handoff-pressure` is permanently `unknown`, preventing healthy posture

Line 298:
```ts
signal({ id: 'handoff-pressure', title: 'Handoff pressure', state: 'unknown', ... })
```

This signal is hardcoded `unknown` and is always included in `allSignals`. `derivePosture`
returns `unknown` if any signal is `unknown` and none is `blocked` or `degraded`.

**This means the observatory can never report `healthy` posture.** In a system with no owner
decisions, no blocked research, no degraded telemetry, no stale front doors, and no failed
systemd units, the posture reads `unknown` because `handoff-pressure` is unconditionally in
the pool.

Confirm this with `derivePosture`:
```ts
if (states.includes('blocked')) return { posture: 'blocked', ... }
if (states.includes('degraded')) return { posture: 'degraded', ... }
if (states.includes('unknown')) return { posture: 'unknown', ... }
return { posture: 'healthy', ... }
```

A permanently-unknown signal in the pool makes the final `return 'healthy'` unreachable.

**Verdict**: Real correctness bug. Must fix before ship. Options:
1. Remove `handoff-pressure` from `allSignals` entirely (don't contribute it to posture
   derivation; render it in the UI as informational only), or
2. Collect actual handoff data: count files in `WORKSPACE_PATHS.runtimeRoot/.handoff/`
   excluding `ARCHIVE/` and use that count to derive a real state.

Option 1 is a one-line fix. Option 2 is correct but adds a new collector.

---

## Summary Table

| # | Finding | Real Bug? | Must Fix? |
|---|---------|-----------|-----------|
| 1 | `readTail` undocumented throwing contract | Low risk | No — add JSDoc |
| 2 | Cache has no concurrency guard | Soft | No — single-user acceptable |
| 3 | `containsPrivateProjectionField` blocklist incomplete + redundant | Non-boundary | No — document |
| 4 | `readBounded` TOCTOU on large file | Reliability | No — document |
| 5 | `timed()` cannot interrupt sync collectors | Reliability | No — document |
| 6 | Double `statSync` in `collectRecentChanges` | Inefficiency | No — minor cleanup |
| 7 | `frontMatter` assumes Unix line endings | Low risk | No |
| 8 | `postureReason` generic even for specific causes | UX gap | No — easy to improve |
| **9** | Test fixture uses undocumented mechanism status | Maintenance hazard | Add comment |
| **10** | Contamination test doesn't test signed contaminated payload | Real test gap | **Yes** |
| 11 | No cache TTL test | Test gap | No — low urgency |
| 12 | `sourceRef` exposes absolute paths | Contained security | No — document scope |
| **13** | `handoff-pressure: unknown` prevents healthy posture | **Real correctness bug** | **Yes** |

## Required Actions Before Ship

**Finding 13**: Remove `handoff-pressure` from `allSignals` or implement a real collector.
The observatory cannot reach `healthy` posture in its current form. This is the single highest
severity finding.

**Finding 10**: Add a test case that calls `resign()` on the contaminated payload before
writing it, then verifies the rejection specifically from the private-key guard.

## Recommended (Not Blocking)

- Finding 3: Comment `containsPrivateProjectionField` as pre-validation only, not a security boundary
- Finding 9: Comment mechanism fixture explaining status is intentionally unconstrained in v1
- Finding 8: Surface the blocking signal's reason in `postureReason` when posture is non-healthy
- Finding 1: Add `@throws` to `readTail` or inline ENOENT handling
