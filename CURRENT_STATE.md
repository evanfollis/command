# CURRENT_STATE — command

**Last updated**: 2026-04-17 — telemetry schema tick (S1-P2 complete)

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Last known commit**: `eb18e35` — "Add sourceType field to telemetry schema (S1-P2)"
- **Auth**: password + JWT in httpOnly cookies
- **Middleware**: fixed — `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`, `NextResponse.redirect(new URL('/login', origin))` in `middleware.ts`

## What's in progress
One handoff pending execution:

1. `command-homepage-redesign-2026-04-16T12-30Z.md` — Significant redesign: Claude/Codex agent selector, project status strip (one row per session from sessions.conf), PM plug-in page at `/sessions/[name]`, simplified layout (remove capability grid from default view, collapse operator tools). 5 acceptance criteria, must pass smoke test.

## What just completed
- **S1-P2 telemetry schema** (commit `eb18e35`): `sourceType: SourceType` added to `TelemetryEvent`. All 16 call sites updated. High-frequency polls (session.captured, executive.thread_read, sessions.listed, capabilities_read) tagged `system`; auth, terminal, send, review, orchestrate, executive message/recover/ensure tagged `user`; taskStore internal events tagged `system`. Rotation script at `scripts/rotate-telemetry.sh` (gzip + 30-day prune, truncates not deletes rolling surface).

## Known broken or degraded
- Runtime state unknown — verify `curl -s https://command.synaplex.ai/api/health` before assuming anything
- App has NOT been redeployed since schema change — `sourceType` will appear in new events only. Old events.jsonl lacks the field (intentional per handoff: no back-fill).

## Blocked on
- Nothing currently. Homepage redesign handoff is self-contained.

## Recent decisions
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. Do NOT use `req.url` or `req.headers.host` as base URL.
- **`check-patterns.ts` ban narrowed**: bans only when `req.url`/`req.headers` is the base URL arg. Do not widen it back.
- **`sourceType` classification**: polling APIs (`session.captured`, `executive.thread_read`, `sessions.listed`, `executive.capabilities_read`) are `system` — they exist to be filtered out. All explicit user-initiated actions are `user`. Internal state tracking (taskStore) is `system`.

## What bit the last session
- Nothing unexpected this tick. Build was clean on first pass.

## What the next agent must read first
1. Read `src/middleware.ts` before touching auth redirect logic
2. Read the homepage redesign handoff: `/opt/workspace/runtime/.handoff/command-homepage-redesign-2026-04-16T12-30Z.md`
3. The `sessions.conf` driving the project status strip: `/opt/workspace/supervisor/scripts/lib/sessions.conf`
4. Run `npm run build` first to confirm the baseline compiles before changes
5. Note: `src/app/api/executive/route.ts` referenced in old state does not exist — the message endpoint is at `src/app/api/executive/message/route.ts`
