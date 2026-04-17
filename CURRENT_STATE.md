# CURRENT_STATE — command

**Last updated**: 2026-04-17T05-49-56Z — homepage redesign tick

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Last known commit**: homepage redesign (this tick) — all 14 smoke checks passing
- **Auth**: password + JWT in httpOnly cookies
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. `NextResponse.redirect(new URL('/login', origin))` in `middleware.ts`. Covers all routes including new `/sessions/[name]`.

## What just completed
- **Homepage redesign** (this tick): Claude/Codex agent selector (localStorage preference, `model` passed per-message), project status strip (one row per session from sessions.conf, live/offline from tmux, last reflection summary from `.meta/`), PM plug-in page at `/sessions/[name]`, capability grid collapsed under `<details>` "Operator tools" shown only when `operator_available === 'yes'`, 14th smoke check added. All 14 pass.
- **S1-P2 telemetry schema** (commit `eb18e35`, deployed this tick): `sourceType: SourceType` on all events.

## Key new routes
- `GET /api/project-status` — returns sessions from sessions.conf with live status and last reflection summary
- `GET /sessions/[name]` — PM plug-in page (pane output, send, auto-refresh 3s)

## Known broken or degraded
- `timestamp: number` still used (workspace standard wants `ts: string` ISO 8601) — 4th cycle without resolution. `meta-scan.ts` works against `timestamp` but cross-tool consumers using workspace standard silently miss all events.
- JWT URL fallback at `server.ts:22` (`url.searchParams.get('token')`) — token-in-URL log leak risk, 4th cycle unfixed.
- Terminal 16ms lifespan on every login — still uninvestigated (day 5).
- `executive.thread_read` emits per poll with `sourceType: 'system'` — file growth continues ~20KB/hr under active UI use.

## Blocked on
- Nothing. Three carry-forward hygiene items (see below) are ready for a small-wins session.

## Recent decisions
- **`claude -p` for Claude routing**: confirmed works without `--dangerously-skip-permissions` (that flag is blocked for root). No `--cwd` flag exists in Claude CLI; use `cwd` in `execFileSync` options instead. This is the live pattern in `executiveConversation.ts`.
- **Model selector in localStorage only**: `model` field sent per-message in POST body. Not persisted server-side.
- **Session→project name mapping**: `general→supervisor`, `skillfoundry→skillfoundry-harness`, `context-repo→context-repository`. Others match 1:1. This mapping lives in `/api/project-status/route.ts:SESSION_TO_PROJECT`.
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. Do NOT use `req.url` or `req.headers.host` as base URL.
- **`check-patterns.ts` ban narrowed**: bans only when `req.url`/`req.headers` is the base URL arg. Do not widen it back.

## What bit the last session
- `use(params)` from React 19 does not work in Next.js 14 client components — params is already a plain object, not a Promise. Fix: destructure `params` directly without `use()`.
- `--dangerously-skip-permissions` is blocked for root users in Claude CLI — do not pass this flag.
- `--cwd` flag does not exist in Claude CLI — use `cwd` option in `execFileSync` instead.

## What the next agent must read first
1. Three carry-forward hygiene items (no handoff needed, self-contained): rename `timestamp→ts` in telemetry.ts, delete JWT URL fallback in server.ts, suppress `executive.thread_read` telemetry emit.
2. `/api/project-status/route.ts` if touching reflection parsing or session/project name mapping.
3. `executiveConversation.ts` if modifying Claude routing — `model` param is the entry point.
4. Note: `src/app/api/executive/route.ts` does not exist — the message endpoint is at `src/app/api/executive/message/route.ts`.
