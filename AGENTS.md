# Command repository instructions

Command is the principal's authenticated, read-only owner observatory for the
Synaplex workspace. It reports bounded health, evidence, closure, eval,
durability, deployment, and lifecycle projections. Codex and Claude
applications own remote operation; this web product does not operate agents.

Read `CURRENT_STATE.md` for current operational orientation,
`docs/architecture.md` for composition and authority boundaries, and
`docs/product-boundary.md` for the exact route/method contract.

## Commands

- `make help` — discover the supported repository interface.
- `make check` — required deterministic pre-merge gate.
- `make build` — checked Next/server build plus secret-boundary scan.
- `make deploy-check` — release/eval/rollback preflight without deployment.
- `npm run smoke` — authenticated HTTP outcome verification.
- `npm run browser:smoke` — authenticated Chromium verification.
- `npm run deploy` — immutable release, atomic cutover, smoke, and rollback.

## Non-negotiable boundaries

- The web surface is read-only except login/logout and their telemetry.
- Do not add terminal attach, tmux send, task dispatch, lifecycle transition,
  agent spawning, review dispatch, or arbitrary process execution.
- Missing or malformed evidence becomes `unknown`; never infer authority,
  health, or a frozen gate from prose or unrelated counts.
- Public projection integrity and private/domain health are separate signals.
- Redirects behind the reverse proxy are relative or use pinned
  `COMMAND_ORIGIN`; never derive a public origin from request headers.
- `JWT_SECRET` is runtime-only and mandatory. It must not be declared in
  `next.config.js`, given a fallback, logged, or embedded in build output.
- Secret-boundary regressions build with injected canary values and scan
  generated artifacts for those exact values; source-name checks alone are
  insufficient.
- Production runs only from immutable releases under the configured runtime
  root using the pinned supported Node LTS toolchain. Never build in or serve
  from the working tree or the host-wide EOL Node runtime.
- Preserve lockfile-bound release dependencies, atomic `current` swaps, smoke
  rollback, and truthful dirty-release identity.
- A failed authenticated HTTP or browser smoke is a failed release regardless
  of process or login liveness. Atomically restore the known previous release,
  verify recovered authenticated health, and retain the failed immutable
  release plus receipt for diagnosis.

## Change discipline

Keep framework routes under `src/app`, reusable read-only collectors and
contracts under `src/lib`, UI under `src/components`, operator/developer entry
points under `scripts`, and service definitions under `deploy`. Mutable state
belongs under the configured workspace runtime root, never in Git.

The product boundary is mechanically enforced. Prompt builders retained for
historical evaluation are formatting-only and may not acquire dispatch,
credential, process, tmux-mutation, or durable-store authority.

Every prompt or instruction change must update its `.prompteval/` loop and pass
a fresh uncached release baseline. Do not inspect sealed holdout definitions
during iteration. Significant auth, boundary, release, or infrastructure
changes require opposing-agent review before deployment.

For every behavioral or security fix, include the smallest deterministic
regression in the same change. In a tool-free or read-only handoff, name that
exact regression instead of claiming to have added or run it. When a request
proposes an unsafe construction, reject it and give both the compliant
construction and its bounded regression check.

For a tool-free decision probe, return a compact handoff with the decision,
applicable boundary, compliant construction or external owner, exact
deterministic regression, and an explicit unverified label. Do not omit a
required element merely because tools are unavailable.

Preserve unrelated dirty files. Commit only attributable changes. Deployment is
done only from a committed, checked tree, followed by authenticated HTTP and
browser outcome evidence plus a verified rollback target.
