# Adversarial Review — command Phase C2 (live attach write path)
**Reviewed**: 2026-04-24T13:00Z | **Reviewer**: Codex | **Scope**: `server.ts`, `src/lib/attachLock.ts`, `src/lib/attachStream.ts`, `src/app/attach/[name]/page.tsx`, `src/lib/tmux.ts`, `scripts/smoke.ts`

## Blocking issues

None after the reconnect lifecycle fix below.

## Findings addressed before deploy

1. **Reconnect close-race could evict the new live socket** — the original lock map keyed only by `clientId`, so an old socket closing after a reconnect could unregister the replacement connection and drop writer ownership. Fixed by tying `unregisterClient()` to the exact `WebSocket` instance and ignoring stale close events.

## Residual tradeoffs

1. **Writer lock remains in-memory, single-process only** — acceptable because `command.service` is still a single host process. If the app ever becomes multi-process, the lock and replay buffer need a shared backend.
2. **Replay is last-20-snapshots, not a durable event log** — acceptable for short reconnect gaps. Longer disconnects fall back to the current pane snapshot.

## Verification

- `npm run build`
- `npm run smoke` (`40/40` passing)
- targeted lock-lifecycle probe: reconnecting with the same `clientId` preserves writer ownership after the old socket closes

## Verdict

Ship Phase C2. No remaining blocker found for single-user, single-process production.
