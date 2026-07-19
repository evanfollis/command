# Command

Command is the authenticated, read-only owner observatory for the Synaplex workspace at `command.synaplex.ai`. It presents bounded health, closure, evidence, eval, deployment, durability, and artifact lineage. Remote operation belongs in the Codex and Claude applications, not this web product.

## Stack

- Next.js App Router, TypeScript, React, and Tailwind CSS
- Minimal custom HTTP server on port 3100
- Password + JWT authentication with an httpOnly cookie
- Immutable host releases under `/opt/workspace/runtime/releases/command/`

## Product boundary

The authenticated web surface is read-only except for login and logout. It has no terminal, tmux attach, message-send, thread creation, review dispatch, executive recovery, task creation, or lifecycle-transition endpoints. Symphony is retained only as a typed lifecycle/closure drilldown.

The exact allowed route and method inventory is documented in `docs/product-boundary.md` and enforced by `npm run product-boundary:test`, which is part of every build.

## Commands

```bash
npm run dev                    # local development server
npm run check                  # pattern and product-boundary gates
npm run observatory:test       # typed collector regressions
npm run product-boundary:test  # route/import/dependency boundary
npm run build                  # checks + Next build + server compilation
npm run smoke                  # authenticated HTTP release smoke
npm run browser:smoke          # authenticated Chromium verification
npm run release:test           # immutable release/rollback invariants
```

Deployment remains an explicit separate action (`npm run deploy`). See `CURRENT_STATE.md` for current release and eval-gate state.

## Internal docs

- `CLAUDE.md` — project charter and implementation constraints
- `CURRENT_STATE.md` — current operational and delivery state
- `docs/product-boundary.md` — authoritative human web boundary
- `docs/observatory-contracts.md` — typed collector contracts
- `.prompteval/` — governed prompt evaluation loops
