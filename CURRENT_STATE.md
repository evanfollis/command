# CURRENT_STATE — command

**Last updated**: 2026-04-17T13-54-24Z — Suppress executive.thread_read telemetry

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Last known commit**: `22e69e6` — executive.thread_read telemetry removed. All 14 smoke checks passing.
- **Auth**: password + JWT in httpOnly cookies (cookie-only — URL token param removed)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. `NextResponse.redirect(new URL('/login', origin))` in `middleware.ts`.

## What just completed
- **executive.thread_read telemetry removed** (`src/app/api/executive/thread/route.ts`): removed the `recordTelemetry` call and its import. Thread polls (3s interval under active UI use) were generating ~20KB/hr of noise in events.jsonl. Read events carry no governance signal; message sends and session state changes remain instrumented.

## Key routes
- `GET /api/project-status` — returns sessions from sessions.conf with live status and last reflection summary
- `GET /sessions/[name]` — PM plug-in page (pane output, send, auto-refresh 3s)
- `GET /api/executive/thread` — returns executive thread state + messages (no longer emits telemetry)

## Known broken or degraded
- Terminal 16ms lifespan on every login — still uninvestigated (day 6).

## No active carry-forwards
All previously noted carry-forwards are resolved. No unblocked hygiene items remain.

## Recent decisions
- **Cookie-only JWT**: URL token fallback removed. Any future WebSocket auth must use cookie, not URL params.
- **Smoke test WS auth**: uses `headers: { Cookie: ... }` in ws library, not `?token=`. Matches what browsers do.
- **`claude -p` for Claude routing**: confirmed works without `--dangerously-skip-permissions`. No `--cwd` flag in Claude CLI; use `cwd` in `execFileSync` options.
- **Model selector in localStorage only**: `model` field sent per-message in POST body.
- **Session→project name mapping**: `general→supervisor`, `skillfoundry→skillfoundry-harness`, `context-repo→context-repository`. Lives in `/api/project-status/route.ts:SESSION_TO_PROJECT`.
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai`. Do NOT use `req.url` or `req.headers.host`.
- **Thread read telemetry omitted by design**: `executive.thread_read` was removed not because it was broken but because it was pure noise. Do not re-add without a concrete observability need.

## What the next agent must read first
1. `executiveConversation.ts` if modifying Claude routing — `model` param is the entry point.
2. `src/app/api/executive/message/route.ts` is the message endpoint (`src/app/api/executive/route.ts` does not exist).
3. Terminal 16ms lifespan bug is the next highest-value open item.
