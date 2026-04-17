# CURRENT_STATE — command

**Last updated**: 2026-04-17T08-54-29Z — JWT URL fallback removal + telemetry rotation cleanup

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Last known commit**: `4f95a8a` — JWT fallback removal + rotate-telemetry.sh deletion. All 14 smoke checks passing.
- **Auth**: password + JWT in httpOnly cookies (cookie-only — URL token param removed)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. `NextResponse.redirect(new URL('/login', origin))` in `middleware.ts`.

## What just completed
- **JWT URL token fallback removed** (`server.ts`): `url.searchParams.get('token')` deleted. Tokens now flow via httpOnly cookie only. Smoke test updated to use `headers: { Cookie: ... }` on WebSocket upgrade instead of `?token=`.
- **`scripts/rotate-telemetry.sh` deleted**: superseded by workspace-level `workspace-telemetry-rotate.timer` (nightly 00:05 UTC). No runtime consumer in command referenced this script.
- **S1-P2 sourceType field**: already deployed as of homepage redesign tick (2026-04-17T05:49Z). `grep -c sourceType events.jsonl` = 12+. Disposition marked verified.

## Key routes
- `GET /api/project-status` — returns sessions from sessions.conf with live status and last reflection summary
- `GET /sessions/[name]` — PM plug-in page (pane output, send, auto-refresh 3s)

## Known broken or degraded
- `timestamp: number` still used — workspace standard reconciled to `timestamp` (epoch ms integer). No migration needed per 2026-04-17T06:02Z disposition. This item is CLOSED.
- Terminal 16ms lifespan on every login — still uninvestigated (day 5).
- `executive.thread_read` emits per poll with `sourceType: 'system'` — file growth continues ~20KB/hr under active UI use.

## Carry-forward hygiene (unblocked)
- Suppress `executive.thread_read` telemetry emit (one-liner in executive route handler).

## Recent decisions
- **Cookie-only JWT**: URL token fallback removed. Any future WebSocket auth must use cookie, not URL params.
- **Smoke test WS auth**: uses `headers: { Cookie: ... }` in ws library, not `?token=`. Matches what browsers do.
- **`claude -p` for Claude routing**: confirmed works without `--dangerously-skip-permissions`. No `--cwd` flag in Claude CLI; use `cwd` in `execFileSync` options.
- **Model selector in localStorage only**: `model` field sent per-message in POST body.
- **Session→project name mapping**: `general→supervisor`, `skillfoundry→skillfoundry-harness`, `context-repo→context-repository`. Lives in `/api/project-status/route.ts:SESSION_TO_PROJECT`.
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai`. Do NOT use `req.url` or `req.headers.host`.

## What bit this session
- The smoke test was using `?token=` URL param for WebSocket auth — removing the server-side fallback immediately broke the smoke. Fix: update smoke.ts to send `Cookie` header instead.

## What the next agent must read first
1. One remaining carry-forward: suppress `executive.thread_read` telemetry emit (minor, unblocked).
2. `executiveConversation.ts` if modifying Claude routing — `model` param is the entry point.
3. `src/app/api/executive/message/route.ts` is the message endpoint (`src/app/api/executive/route.ts` does not exist).
