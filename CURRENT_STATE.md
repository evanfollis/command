# Command — Current State

**Last updated:** 2026-07-19T22:28Z — thread-opening executor contamination corrected after fresh run `2a578c`; prompt, golden, baseline, and holdout artifacts preserved unchanged. No external eval or deployment run here.

## Current product boundary

- Human pages: `/`, `/lineage`, `/artifacts`, artifact markdown drilldowns, `/symphony`, and `/login`.
- Read-only authenticated APIs: health, metrics, eval summary, project status, context usage, and Symphony lifecycle reads.
- Login/logout are the only intentional human web mutations.
- Removed, not hidden: Operator tools, tmux attach/WebSocket streaming, session panes, message sending, executive recovery/control, review dispatch, conversational threads, browser beacon ingestion, Symphony task creation, and Symphony transitions.
- `scripts/product-boundary-test.ts` is part of `npm run check` and fails if legacy route sources, links/imports, mutation methods, or terminal dependencies return.
- The exact route/method contract is `docs/product-boundary.md`.

## Observatory state

- Home is the private owner-health projection: authority, knowledge health, closure conversion, current owners/cycles, timers, deployment identity, remote durability, prompt/eval reliability, public-projection integrity/domain health, and recent material movement.
- Synaplex public projection consumers validate pinned v1.0/v1.1 typed contracts and the producer-declared canonical digest. Research domain health is distinct from projection integrity; blocked typed research blocks the Research signal and overall posture.
- Owner authority remains unknown without an explicit typed principal-authority source. Handoff prose and unrelated project movement do not become health evidence.
- Symphony remains visible only as read-only typed lifecycle and closure history; autonomous producers own its store.

## Release state

- The current immutable-release symlink observed during this work points to `20260712T202224Z-2a6d684`.
- Release assembly uses staged-lockfile-matched dependency trees for build and runtime. Dirty releases reject untracked inputs; rollback must prove service active and configured-port `/login` health.
- This product-boundary correction is intentionally not deployed in this session.

## Prompt-eval state and protected evidence

- **offline-synthesis-prompt**: Preserved baseline `run-20260719T184416Z-615bee` passed at aggregate 1.0, but the shared adapter neutrality correction now creates executor drift. A fresh no-cache release baseline is required before deploy; the accepted baseline file was not rewritten.
- **review-prompt**: Preserved baseline remains historically passing, with 1 unpromoted candidate warning (7d old), but the shared adapter neutrality correction creates executor drift. A fresh no-cache release baseline is required before deploy; the accepted baseline file was not rewritten.
- **thread-opening-frame**: Fresh run `run-20260719T222652Z-2a578c` passed both sealed holdouts with unknown ratio `0.0` but failed required active `gc-8acedf6373be4e4a` and production `gc-45128a2d178513a7`. Root traced the structural cause through the real executor: shared `PROBE_PREFIX` directed models with unavailable mutation to show exact artifacts and commands rather than defer, contradicting the governed stop condition and contaminating both behaviors. The prefix now states capabilities and epistemic honesty only; it does not steer acting, deferring, asking, escalation, or artifact/command production. Prompt, active/golden, baseline, and sealed holdout files remain byte-identical. Bounded receipt: `.prompteval/thread-opening-frame/archive/run-20260719T222652Z-2a578c/`. **Needs a fresh no-cache release run from general.**
- **codex-task-prompt**: No baseline. Cases replaced from retired `attachLock.ts` sources to current owner-observatory cases (archived under `v2-product-boundary-20260719`). Prompt strengthened (commits `b787525`, `db026ba`) to require ordering, partial-failure recovery, idempotent replay/backfill, and producer ownership proof before calling comprehensive. Adapter timeout profiled: 380s in `adapter_llm.run_prompt()` is adequate for v2 cases (runs 318ec6 and eec522 completed without timeout); spec timeout is 900s; no change needed. Original 2026-07-17 timeout was with the retired v1 golden set. **Needs fresh no-cache release run from general — run request handoff sent 2026-07-19T21:39Z.**
- `prompteval check .` fails closed for Codex-task missing baseline, shared-adapter drift in offline/review/thread, and thread prompt/golden drift, plus the review candidate warning. Command session is sandbox-blocked from subscription-CLI calls; runs route to general per pressure-queue protocol.
- Deployment remains blocked until general refreshes every drifted/missing baseline and `prompteval check .` passes clean.

## Internal evaluator boundary

- `scripts/render-prompt.ts` still imports the governed review and Codex task builders. Their historical execution helpers remain offline/internal source dependencies for exact prompt rendering and deterministic regression coverage.
- No Next page, route, component, or `server.ts` import exposes that machinery. Adding a web route for it violates the product boundary.

## Verification completed

- Adapter neutrality tests pin the capability-only prefix and prove both Claude-primary and Codex-primary system/message paths receive the governed prompt, user message, and neutral context without action/defer/escalation steering. Thread prompt, active cases, baseline, and sealed holdout hashes remain `a487a3e6…b7526`, `417b3651…421a`, `52275948…8bb7`, and `e089337a…d29b8` respectively.
- Thread-opening stop-condition ordering, required/advisory semantics, bounded run `d57d63` provenance, and unchanged sealed holdout hash are covered deterministically. The stop rule precedes both recoverability classification and the reversible-action default.
- Thread-opening targeted regeneration now preserves the exact six-case advisory set, 9 required active cases, and corrected immutable-run required-aggregate semantics (`10/11`, `0.9091`). Both sealed records remain byte-identical as a whole at SHA-256 `e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8`.
- Thread-opening burn-promotion, immutable receipt, active-contract fingerprint, destructive-state policy, targeted generator isolation, reseal count/hash, and surviving-record byte-preservation checks pass. The new sealed holdout has 2 records at SHA-256 `e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8`.
- Codex-task targeted regeneration, failed-run provenance, generic-rubric exception, coupled-store durability prompt assertions, real-builder rendering, prompt timeout configuration, `npm check`, TypeScript, and the production build pass. The sealed Codex holdout remained byte-identical at `e7ad1dd7c30f879bf2135be5252fadf2132aba165f06cbd18a5d57b570fb091b` before and after generation.
- Product-boundary, observatory, eval telemetry/config, golden-contract, Codex builder, offline-synthesis, immutable release/rollback, TypeScript, and production build gates pass.
- Final authenticated HTTP smoke passed against an isolated candidate on port 3111: every retired page/API returned 404; Symphony `POST`/`PATCH` returned 405; retained read APIs and all authenticated shell assets returned 200.
- Final Chromium smoke passed desktop and 390px mobile with zero JS errors, no horizontal overflow, no legacy navigation, no Symphony controls/forms, and authenticated 404s for `/operator-tools`, `/attach/general`, and `/sessions/general`. Receipt: `/opt/workspace/runtime/browser-smoke/2026-07-19T19-11-27/`.
- Review, thread, offline, and all sealed holdout hashes match the pre-change snapshot. The Codex-task active golden changed intentionally and its retired records/source are archived with fixed provenance.
- Codex-task adapter profiled (2026-07-19T21:39Z tick): `adapter_llm.run_prompt()` uses `timeout=380`. V2 cases complete within this limit. Original v1 timeout was with a larger/more complex golden set (now retired). Spec timeout 900s is already set. No adapter change needed.
