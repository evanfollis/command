# Command — Current State

**Last updated:** 2026-07-20T02:30Z — reflection pass. General ran three eval baselines (thread-opening, review-prompt, offline-synthesis) but NOT codex-task-prompt. All three baselines pass but are uncommitted. Deploy gate still blocked on missing codex-task baseline.

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

- **offline-synthesis-prompt**: Fresh no-cache run `run-20260719T232005Z-65757a` failed closed at required aggregate `0.9286`; both sealed holdouts passed with zero unknowns. Sole required active failure `gc-863e35027ce505e8` encoded an Atlas success contradicted by current source, and the read-capable probe correctly refused to preserve the stale claim. The case is retired and replaced at generator source by required active `gc-04a60cb9b6eb809c`, a verified current Command preflight-drift success with the exact same `preserve-success` rubric. Bounded receipt: `.prompteval/offline-synthesis-prompt/archive/run-20260719T232005Z-65757a/`. **Needs a fresh no-cache release rerun from root.**
- **review-prompt**: Preserved baseline remains historically passing, with 1 unpromoted candidate warning (7d old), but the shared adapter neutrality correction creates executor drift. A fresh no-cache release baseline is required before deploy; the accepted baseline file was not rewritten.
- **thread-opening-frame**: Fresh clean-chain run `run-20260720T003030Z-996c20` passed both sealed holdouts and production regression `gc-45128a2d178513a7` with zero unknowns, but failed required active `gc-c95df250b240acf5` and `gc-8acedf6373be4e4a`; `gc-4510aa59bb317153`, `gc-77af07ccce1b8d0a`, and `gc-f85b557dfdc65b38` remained advisory. Both required outputs answered diagnostically, while the shared judge misclassified read-only evidence gathering and a rejected read-capability check as operational action. The generated rubric now distinguishes diagnostic inspection from state-changing or unrelated operations without changing required status or the `0.98` floor. During diagnosis, an insufficient repository-search exclusion accidentally surfaced sealed `gc-1007e85d5add0881`; its content was not used, but it was mechanically archived/promoted and replaced so future evidence is not contaminated. The other sealed record remains byte-identical. Bounded receipt: `.prompteval/thread-opening-frame/archive/run-20260720T003030Z-996c20/`. **Needs a fresh no-cache release rerun from root.**
- **codex-task-prompt**: Fresh no-cache release run `run-20260720T000322Z-5a9247` failed closed at aggregate `0.7333`, unknown ratio `0.0`. Required active failures were `gc-19391fb63459606e`, `gc-77322229d9ca8bd2`, and `gc-0208a8225000a225`; sealed `gc-707407cf7bb9f58d` failed while the other two sealed records passed. The failed sealed record was kept opaque until mechanically archived and promoted with its input/check contract unchanged, then inspected as active. The two passing sealed records remain byte-identical and one newly minted opaque replacement restores the three-record sealed set. Bounded receipt: `.prompteval/codex-task-prompt/archive/run-20260720T000322Z-5a9247/`. Root cause was structural: the Codex executor advertised Claude-only tools, the governed frame allowed generic capability-only replies instead of complete safe handoffs, and release diagnosis did not require runtime/readiness grounding. Provider-specific neutral capability context and prompt-level handoff/release grounding now close those classes without changing rubrics or thresholds. **Needs a fresh no-cache release rerun from root.**
- **offline-synthesis-prompt**: Fresh release baseline `run-20260720T020106Z-e3efc0` (aggregate 1.0, passed) written to working tree by general at 02:01Z. **Uncommitted.** Requires `git add .prompteval/offline-synthesis-prompt/baseline.json` before `prompteval check .` will see it.
- **review-prompt**: Fresh release baseline `run-20260720T013619Z-541af5` (aggregate 1.0, passed) written to working tree by general at 01:36Z. **Uncommitted.** Candidate warning cleared.
- **thread-opening-frame**: Fresh release baseline `run-20260720T011620Z-98c9b2` (aggregate 0.6667 overall, `passed: true` — all `must_pass:true` cases pass; 6 advisory cases failing but non-blocking) written to working tree by general at 01:16Z. **Uncommitted.**
- **codex-task-prompt**: Still **no baseline file**. General did not run this despite the 21:39Z handoff request. Handoff `general-command-prompteval-run-request-2026-07-19T21-39-13Z.md` is still open.
- `prompteval check .` will still fail on codex-task (no baseline) and spec-drift on the three uncommitted prompts. Command session is sandbox-blocked from subscription-CLI calls.
- Deployment remains blocked until: (1) codex-task baseline run completes, (2) all four baselines are committed, (3) `prompteval check .` passes clean, (4) `npm run deploy` is authorized.

## Internal evaluator boundary

- `scripts/render-prompt.ts` still imports the governed review and Codex task builders. Their historical execution helpers remain offline/internal source dependencies for exact prompt rendering and deterministic regression coverage.
- No Next page, route, component, or `server.ts` import exposes that machinery. Adding a web route for it violates the product boundary.

## Verification completed

- Offline-synthesis run/cache provenance, stale-case retirement, live-source verification, unchanged required rubric, targeted regeneration idempotence, baseline preservation, and sealed-holdout preservation pass deterministically. Active cases now hash to `d54ef7a576e2583c2533c4c25bc8e8738431cf1d0b6bde356973539d755bb942`; sealed holdout remains `826d23bdbf231f326890b8e5a2f2f65ff7d76dc85ef4afb2ad9a5d5cda79e992`.
- Adapter neutrality tests pin the capability-only prefix and prove both Claude-primary and Codex-primary system/message paths receive the governed prompt, user message, and neutral context without action/defer/escalation steering. Thread prompt, active cases, baseline, and sealed holdout hashes remain `a487a3e6…b7526`, `417b3651…421a`, `52275948…8bb7`, and `e089337a…d29b8` respectively.
- Thread-opening stop-condition ordering, required/advisory semantics, bounded run `d57d63` provenance, and unchanged sealed holdout hash are covered deterministically. The stop rule precedes both recoverability classification and the reversible-action default.
- Thread-opening targeted regeneration now preserves the exact six-case advisory set, 9 required active cases, and corrected immutable-run required-aggregate semantics (`10/11`, `0.9091`). Both sealed records remain byte-identical as a whole at SHA-256 `e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8`.
- Thread-opening burn-promotion, immutable receipt, active-contract fingerprint, destructive-state policy, targeted generator isolation, and surviving-record byte-preservation checks pass. The `f9f05a` transition produced the historical two-record sealed set at SHA-256 `e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8`; run `996c20` subsequently retired one contaminated record as described below.
- Thread-opening run `996c20`, both active cache fingerprints, required/advisory classification, diagnostic-inspection boundary, accidental-contamination retirement, exact surviving sealed line, and replacement lineage are pinned deterministically. The active set is SHA-256 `23f4510ce818de6c0aaf650804108897a0fbf2f84233e5cc236d02419368a151`; the resealed two-record holdout is SHA-256 `46b7df1dbeea2a434156267caaf41130afa45f8a2bbbe80d08e2c8eac31ead43`.
- Codex-task burn/reseal provenance is pinned deterministically: pre-transition sealed SHA-256 `e7ad1dd7c30f879bf2135be5252fadf2132aba165f06cbd18a5d57b570fb091b`; promoted contract fingerprint `f42a1dd70d8818ce0b3cab87fe0974830ab920b18fb8e34736db0ad14d9d05f0`; post-transition active SHA-256 `339bbf33e31c0d317333fc5b0712aed18019f5728873790171407194f04a1297`; resealed SHA-256 `cd0c432fcc1e1dabbb044782821c80118ee2150a28d57c1ccbab260a70e7448e`. The surviving sealed line hashes remain exact and the opaque replacement line is pinned at `943aacda181e423713894fe9762785f2a4644720cc33f38da62dfc23cec75e69`.
- Product-boundary, observatory, eval telemetry/config, golden-contract, Codex builder, offline-synthesis, immutable release/rollback, TypeScript, and production build gates pass.
- Final authenticated HTTP smoke passed against an isolated candidate on port 3111: every retired page/API returned 404; Symphony `POST`/`PATCH` returned 405; retained read APIs and all authenticated shell assets returned 200.
- Final Chromium smoke passed desktop and 390px mobile with zero JS errors, no horizontal overflow, no legacy navigation, no Symphony controls/forms, and authenticated 404s for `/operator-tools`, `/attach/general`, and `/sessions/general`. Receipt: `/opt/workspace/runtime/browser-smoke/2026-07-19T19-11-27/`.
- Review, thread, offline, and all sealed holdout hashes match the pre-change snapshot. The Codex-task active golden changed intentionally and its retired records/source are archived with fixed provenance.
- Codex-task adapter profiled (2026-07-19T21:39Z tick): `adapter_llm.run_prompt()` uses `timeout=380`. V2 cases complete within this limit. Original v1 timeout was with a larger/more complex golden set (now retired). Spec timeout 900s is already set. No adapter change needed.
