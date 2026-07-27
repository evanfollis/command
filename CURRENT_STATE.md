# Command — Current State

**Updated:** 2026-07-27T01:15Z

Command is the private, authenticated owner observatory for the Synaplex workspace. The legacy remote-operation product has been removed rather than hidden.

## Live release

- State: clean immutable release; `command.service` active on the configured local port
- Authoritative identity: `/opt/workspace/runtime/releases/command/current/RELEASE.json`
- Deployment path: `/opt/workspace/runtime/releases/command/current`
- Verification: authenticated HTTP smoke passed; Chromium desktop/mobile smoke passed (2026-07-20)
- Browser receipt: `/opt/workspace/runtime/browser-smoke/2026-07-20T09-24-59/`
- **Working-tree gate status: FAILING** — `codex-task-prompt` golden hash drifted from accepted baseline. Uncommitted changes to `golden/holdout.jsonl` and `scripts/golden-contract-test.py` need a fresh uncached baseline before the next deploy.

## Working-tree status (2026-07-27)

The `fe3e62c` commit (2026-07-26) performed a major migration:

- Added `AGENTS.md` (canonical charter, now a 5th governed prompt as `repository-instructions`)
- Added `Makefile`, `repo.toml`, `.github/` (CI, Dependabot, CodeQL), `.node-version`
- Added full `docs/architecture.md`, updated `docs/product-boundary.md`
- Renamed `src/middleware.ts` → `src/proxy.ts` (Next.js 16 middleware convention change)
- Added `deploy/command.service` (versioned complete unit), `deploy/command-canary.service`
- Added `scripts/install-service-unit.sh`, `scripts/install-node-runtime.sh`, `scripts/service-unit-test.sh`
- Added 5th governed prompt eval loop: `repository-instructions`
- Deleted retired operator files: `src/lib/{executive,executor,review,router,taskStore,symphonyStore,environments,metaLearning}.ts`

Subsequent commits (6b0ceec, 56d3a42, 1f4bf4c, 6906e2b, a13c4a4, fe3e62c) quarantined exposed eval evidence, hardened credential boundary, documented root ownership exception.

Uncommitted changes (not yet committed):
- `.prompteval/codex-task-prompt/archive/exposure-20260726T234755Z/exposure-receipt.json` (modified)
- `.prompteval/codex-task-prompt/golden/holdout.jsonl` (1 line added — exposure quarantine rotation)
- `scripts/golden-contract-test.py` (hardened reference search, +55 net lines)
- `.prompteval/codex-task-prompt/archive/exposure-20260726T234755Z/clean-room-audit-receipt.json` (untracked)
- `.prompteval/codex-task-prompt/archive/exposure-20260726T234755Z/sealing-receipt.json` (untracked)

## Product boundary

The retained human surfaces are the owner observatory, evidence lineage, artifacts, read-only Symphony lifecycle evidence, and login. Retained APIs are authenticated read-only health, metrics, eval, project-status, context-usage, and Symphony reads. Login/logout are the only intentional browser mutations.

Operator tools, terminal attach, sessions, messaging, review dispatch, executive recovery/control, conversation threads, client beacons, and Symphony mutations are absent. Deployment smoke proves retired pages and APIs return 404 and Symphony mutation methods return 405.

## Health model

The home view reports:

- owner authority and unresolved decisions;
- knowledge-loop and research-domain health;
- diagnosis-to-execution closure conversion;
- active cycles and accountable owners;
- automation, freshness, durability, and deployment identity;
- prompt/eval reliability, provider fallback, and bounded telemetry;
- public/private projection integrity and recent material movement.

Collectors are bounded and isolated. A failed or malformed source degrades its own signal and records a collector error; it does not block the dashboard. Private transcripts remain outside the public projection.

## Prompt and evaluation evidence (5 governed prompts as of fe3e62c)

- Codex task: baseline from `run-20260720T083722Z-cbdf26`; **golden hash drifted — needs fresh baseline**
- Offline synthesis: baseline accepted; 14/14 required
- Review: baseline accepted; 15/15 required plus 1/1 advisory
- Thread opening: baseline accepted; 12/12 required; five of six advisory probes intentionally fail
- Repository instructions (AGENTS.md): baseline accepted (added 2026-07-26)

## Pending handoff

`command-july-2026-profiled-repository-migration-2026-07-26T19-57-29Z.md` — high-priority migration
task (ADR-0050 full compliance, JWT defect fix, CI, lint/type, eval gate repair, service hardening).
Depends on the architecture inventory (this tick) completing first. Next tick should execute it.

## Next actions

1. Commit and accept the golden hash drift resolution (`codex-task-prompt`): commit the three
   pending files, run `prompteval run --no-cache --update-baseline codex-task-prompt`, accept.
2. Execute the July 2026 repository migration handoff (`command-july-2026-profiled-repository-migration-2026-07-26T19-57-29Z.md`).
3. Verify `src/proxy.ts` registers as Next.js 16 middleware on a fresh `make build`.
4. Clean dead paths from `workspacePaths.ts` (`mentorRoot`, `recruiterRoot`).
