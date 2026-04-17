# CURRENT_STATE — command

**Last updated**: 2026-04-17T16-56-44Z — terminal investigation tick

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Last known commit**: terminal investigation tick — 15/15 smoke checks passing
- **Auth**: password + JWT in httpOnly cookies (cookie-only — URL token param removed)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. `NextResponse.redirect(new URL('/login', origin))` in `middleware.ts`.

## What just completed
Terminal investigation — 7-day carry-forward resolved:

The 14-27ms `terminal.connected/disconnected` events were all smoke test connections, not broken user sessions. The smoke test opens a WS, receives the first PTY frame (~15-20ms), closes immediately. This was logged as `sourceType: 'user'` — telemetry misidentification.

Root-cause verified: localhost WS stays alive 5+ seconds; cloudflared WS stays alive 5+ seconds; exact service env shell (no HOME) stays alive 3+ seconds. The terminal protocol is sound.

**Commits this tick:**
- Terminal investigation + telemetry fixes (see delivery state)

**Fixes landed:**
1. `server.ts`: Smoke test connections tagged `sourceType: 'smoke'` via `X-Source-Type` header (browsers can't set custom WS headers). Added `closeCode`/`closeReason` to `terminal.disconnected`. Added `terminal.pty_exit` event (exitCode, signal).
2. `scripts/smoke.ts`: Pass `X-Source-Type: smoke` header on WS check.
3. `src/app/terminal/page.tsx`: Added `if (cancelled) return` before WS creation to prevent orphaned connections when component unmounts during dynamic imports.
4. `scripts/check-patterns.ts`: Extended to scan `server.ts` (carry-forward fix).

## Key routes
- `GET /api/project-status` — returns sessions from sessions.conf with live status and last reflection summary
- `GET /sessions/[name]` — PM plug-in page (pane output, send, auto-refresh 3s)
- `GET /api/executive/thread` — returns executive thread state + messages (no telemetry)

## Known broken or degraded
- **Possible auth double-submit** — telemetry shows `auth.login_failed` + `auth.login_succeeded` 15ms apart on the same login session. Investigate login form submit handling.

## Telemetry contract (updated)
- `terminal.connected`: `sourceType: 'smoke'` for smoke tests; `'user'` for real browser sessions.
- `terminal.disconnected`: now includes `closeCode` (1005=client normal close, 1006=abnormal, 1001=going away) and `closeReason`.
- `terminal.pty_exit`: fires when PTY process exits (exitCode, signal). Code 0/signal 1 = SIGHUP from terminal hangup (normal after ws.close).

## Carry-forwards
- **`/review` not invoked for `e234231`** — major feature (533 additions, 7 files). Second consecutive cycle skipped. Third skip would be a policy violation.
- **Possible auth double-submit** — telemetry shows `auth.login_failed` + `auth.login_succeeded` 15ms apart on the same login session. Investigate login form submit handling.
- **Smoke test double-check** — smoke shows "WS /ws/terminal streams output within 500ms" twice when PTY sends two frames before close handshake completes. Benign (both succeed), but inflates the visible check count from 14 to 15.

## Recent decisions
- **Cookie-only JWT**: URL token fallback removed. Any future WebSocket auth must use cookie, not URL params.
- **Smoke test WS auth**: uses `headers: { Cookie: ... }` in ws library, not `?token=`. Matches what browsers do.
- **Smoke test sourceType**: uses `X-Source-Type: smoke` header. Server detects this. Browsers cannot set custom WS headers, so only programmatic clients can set this.
- **`claude -p` for Claude routing**: confirmed works without `--dangerously-skip-permissions`. No `--cwd` flag in Claude CLI; use `cwd` in `execFileSync` options.
- **Model selector in localStorage only**: `model` field sent per-message in POST body.
- **Session→project name mapping**: `general→supervisor`, `skillfoundry→skillfoundry-harness`, `context-repo→context-repository`. Lives in `/api/project-status/route.ts:SESSION_TO_PROJECT`.
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai`. Do NOT use `req.url` or `req.headers.host`.
- **Thread read telemetry omitted by design**: `executive.thread_read` was removed not because it was broken but because it was pure noise. Do not re-add without a concrete observability need.
- **`timestamp: number` (epoch ms) is the correct field name**: Workspace CLAUDE.md was reconciled on 2026-04-17 to match reality. Do not rename to `ts: string`.

## What the next agent must read first
1. **Auth double-submit** is the top remaining carry-forward. Check login form submit handler in `src/app/login/page.tsx` for double-submit scenario.
2. **`/review` for `e234231`** must be run — third skip would violate the adversarial review policy.
3. `executiveConversation.ts` if modifying Claude routing — `model` param is the entry point.
4. `src/app/api/executive/message/route.ts` is the message endpoint (`src/app/api/executive/route.ts` does not exist).
5. `/review` is required before closing any tick that touches ≥3 files or adds ≥100 lines.

## Remaining uncertainty
- Terminal was NOT tested in an actual browser during this tick. WS protocol confirmed working via Node client through cloudflared. If Evan does observe a broken terminal in the browser, the `closeCode` field in `terminal.disconnected` now disambiguates: 1001 = browser navigating away (React cleanup), 1006 = network/proxy drop, 1000 or 1005 = clean client close.
