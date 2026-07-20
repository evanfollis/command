# Command — Current State

**Updated:** 2026-07-20T09:26Z

Command is the private, authenticated owner observatory for the Synaplex workspace. The legacy remote-operation product has been removed rather than hidden.

## Live release

- State: clean immutable release; `command.service` active on the configured local port
- Authoritative identity: `/opt/workspace/runtime/releases/command/current/RELEASE.json`
- Deployment path: `/opt/workspace/runtime/releases/command/current`
- Verification: authenticated HTTP smoke passed; Chromium desktop/mobile smoke passed with no JavaScript errors or horizontal overflow
- Browser receipt: `/opt/workspace/runtime/browser-smoke/2026-07-20T09-24-59/`

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

## Prompt and evaluation evidence

All four prompt artifacts are governed, release-evaluated without cache, provenance-bound to actual provider routes, and accepted:

- Codex task: `run-20260720T083722Z-cbdf26`, 16/16 required, aggregate `1.0`, unknown ratio `0.0`, prompt `pv-0b6adfd6d31abcaa`
- Offline synthesis: `run-20260720T053721Z-a77b42`, 14/14 required, aggregate `1.0`, unknown ratio `0.0`
- Review: `run-20260720T053721Z-7adf3b`, 15/15 required plus 1/1 advisory, aggregate `1.0`, unknown ratio `0.0`
- Thread opening: `run-20260720T053437Z-53294d`, 12/12 required; five of six intentionally non-gating advisory probes failed and remain visible

Full run-scoped model inputs, outputs, diagnostics, and latent execution provenance are retained in owner-only `0700/0600` transcript storage. Aggregate telemetry stays compact and non-blocking. Claude subscription throttling fell back to the Codex subscription during the final run, proving the intended cross-provider circuit without API keys.

The final adversarial review at exact evaluated HEAD returned `VERDICT: DEPLOYABLE`. Deployment preflight passes.

## Remaining maintenance

- Curate the seven-day-old review candidate and rotate saturated review cases into harder or production-derived evidence.
- Keep thread-opening advisory failures observational until evidence justifies promoting a specific behavior into the required contract.
- Continue replacing synthetic cases with production regressions while preserving sealed holdout independence.

These are maintenance signals, not deployment blockers.
