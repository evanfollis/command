# Command — Current State

**Last updated:** 2026-07-19 — Codex-task release feedback corrected without inspecting or changing sealed holdouts. No external evaluation or deployment was run.

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

- `review-prompt`, `thread-opening-frame`, and `offline-synthesis-prompt` baseline files are preserved unchanged.
- Fresh no-cache release run `run-20260719T195258Z-eec522` failed closed at `0.8`. Active `gc-77322229d9ca8bd2` exposed a contradictory generic responsiveness rubric; active `gc-dacb6094a0651bd4` exposed comprehensive patch language despite unresolved coupled-store durability. One sealed case was judge-unknown because the judge output was unparseable; that is not behavioral failure evidence and no holdout content was inspected.
- The immutable receipt, active cache hashes, and bounded failure dispositions are archived under `.prompteval/codex-task-prompt/archive/run-20260719T195258Z-eec522/`.
- The generic active rubric now counts a truthful exact command/cwd handoff as direct progress when the probe cannot execute. The prompt now requires ordering, partial-failure recovery, idempotent replay/backfill, and producer ownership proof before a coupled-store proposal may be called exact or comprehensive.
- Two active (not holdout) Codex-task cases that named retired `attachLock.ts` source were archived with the exact historical source under `.prompteval/codex-task-prompt/archive/v2-product-boundary-20260719/` and replaced with current owner-observatory cases of the same behavioral dimensions. The generator now leaves sealed holdouts unopened unless an explicit `--rewrite-holdouts` flag is supplied.
- No prompt, accepted baseline, or sealed holdout was changed. Removing the retired thread runtime also removed a stale `threadConversation.ts` executor dependency from the thread-opening spec, so its preserved baseline is now correctly drifted rather than backed by a dead file. Root must run fresh no-cache release evaluations for both `codex-task-prompt` and `thread-opening-frame` from the committed product-boundary SHA.
- Current `prompteval check .` remains fail-closed for Codex-task prompt/golden drift and thread-opening executor-dependency drift; review also reports one unpromoted candidate warning.
- Deployment remains blocked until root accepts fresh passing Codex-task and thread-opening baselines and the full gate passes.

## Internal evaluator boundary

- `scripts/render-prompt.ts` still imports the governed review and Codex task builders. Their historical execution helpers remain offline/internal source dependencies for exact prompt rendering and deterministic regression coverage.
- No Next page, route, component, or `server.ts` import exposes that machinery. Adding a web route for it violates the product boundary.

## Verification completed

- Codex-task targeted regeneration, failed-run provenance, generic-rubric exception, coupled-store durability prompt assertions, real-builder rendering, prompt timeout configuration, `npm check`, TypeScript, and the production build pass. The sealed Codex holdout remained byte-identical at `e7ad1dd7c30f879bf2135be5252fadf2132aba165f06cbd18a5d57b570fb091b` before and after generation.
- Product-boundary, observatory, eval telemetry/config, golden-contract, Codex builder, offline-synthesis, immutable release/rollback, TypeScript, and production build gates pass.
- Final authenticated HTTP smoke passed against an isolated candidate on port 3111: every retired page/API returned 404; Symphony `POST`/`PATCH` returned 405; retained read APIs and all authenticated shell assets returned 200.
- Final Chromium smoke passed desktop and 390px mobile with zero JS errors, no horizontal overflow, no legacy navigation, no Symphony controls/forms, and authenticated 404s for `/operator-tools`, `/attach/general`, and `/sessions/general`. Receipt: `/opt/workspace/runtime/browser-smoke/2026-07-19T19-11-27/`.
- Review, thread, offline, and all sealed holdout hashes match the pre-change snapshot. The Codex-task active golden changed intentionally and its retired records/source are archived with fixed provenance.
