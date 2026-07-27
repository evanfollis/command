# Command

Command is the active, private owner observatory for the Synaplex workspace at
`command.synaplex.ai`. It presents bounded health, closure, evidence, eval,
deployment, durability, and artifact lineage. Remote operation belongs in the
Codex and Claude applications, not this web product.

The release candidate uses authenticated read-only routes, runtime-only JWT
signing, typed evidence with explicit `unknown` states, immutable
lockfile-bound releases with smoke rollback, and a dedicated nologin service
identity. It does not claim to be an agent runtime. Narrow legacy evidence ACLs
and their projection-removal milestone are documented in
`docs/architecture.md`.

## Product boundary

The authenticated web surface is read-only except for login and logout. It has no terminal, tmux attach, message-send, thread creation, review dispatch, executive recovery, task creation, or lifecycle-transition endpoints. Symphony is retained only as a typed lifecycle/closure drilldown.

The exact allowed route and method inventory is documented in `docs/product-boundary.md` and enforced by `npm run product-boundary:test`, which is part of every build.

## Prerequisite

Use Node `24.18.0` (also declared in `.node-version` and `package.json`).
Hosted installation is checksum-pinned through `make runtime-setup`; local
dependency installation is `make setup`.

## Fastest meaningful check

```bash
make check
```

Use `make help` for the full interface. `make build` adds the production build
and secret scan; `make deploy-check` adds release/rollback preflight without
deploying. Deployment remains the explicit immutable `npm run deploy` path.

## Navigate

- `AGENTS.md` — canonical repository instructions
- `SECURITY.md` — private reporting and supported security boundary
- `CURRENT_STATE.md` — current operational and delivery state
- `docs/architecture.md` — composition, artifact roles, deployment, and safety
- `docs/credential-rotation.md` — current credential exception and secure rotation
- `docs/product-boundary.md` — authoritative human web boundary
- `docs/observatory-contracts.md` — typed collector contracts
- `.prompteval/` — governed prompt evaluation loops
