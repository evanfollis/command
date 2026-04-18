# Command — Executive Front Door

context-always-load:
  - CURRENT_STATE.md

## What This Is
Cross-platform web app that serves as the principal-facing executive surface for this server. It should be the always-on front door into all projects: dashboard, web terminal, agent session management, adversarial review, and host-side recovery without requiring the user to SSH in and paste shell commands back to agents.

## Architecture
- **Framework**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Server**: Custom server.ts wrapping Next.js + WebSocket (node-pty for terminal)
- **Auth**: Password + JWT in httpOnly cookies
- **Port**: 3100
- **URL**: command.synaplex.ai (via Cloudflare Tunnel)
- **Runs on host** (not Docker) — needs direct access to tmux, docker, filesystem
- **Acts as the operator bridge** for web-triggered recovery and control-plane actions that attached agent harnesses cannot execute directly

## Key Paths
- `server.ts` — Custom server entry point (HTTP + WebSocket)
- `src/app/` — Next.js pages (dashboard, terminal, sessions, login)
- `src/app/api/` — API routes (auth, health, sessions, send, review)
- `src/lib/` — Server-side helpers (auth.ts, tmux.ts, health.ts)
- `src/components/` — Shared UI components (Nav, Shell)

## Active Decisions

### Quality standard
- **No bandaid fixes.** If a bug can only be "fixed" by asking the user to clear their cache, switch browsers, or change settings, you haven't found the bug. Those are diagnostic hints. The real fix lives in the server code, the response headers, or the infrastructure config — find it.
- **Read the user's evidence literally before theorizing.** A screenshot showing `localhost` in the URL bar is a complete answer, not a clue. Don't build speculative explanations over primary evidence.
- **Behind cloudflared: never build absolute URLs from `req.url`, `req.headers.host`, or `new URL(path, req.url)`.** The internal origin is `localhost:3000`; the public origin is `command.synaplex.ai`. Use relative `Location` headers for redirects. If you need a public URL, pin it in config — never infer it from request headers.
- **"Works on my machine" / curl-from-localhost is not verification.** Curl doesn't replay browser caches, service workers, SameSite enforcement, or ITP. When a fix depends on client-side behavior, confirm from the actual failing client or reason explicitly about why the client path matches the curl path.
- **Eliminate failure classes, not instances.** A `buildOrigin()` helper papers over one proxy mismatch; a relative `Location` header eliminates every proxy mismatch of that shape forever. Prefer the second kind of fix.

### Architecture
- **No Docker for this app.** It needs host-level access to tmux sessions, docker CLI, and the filesystem. Running in a container would add unnecessary complexity.
- **Single-port architecture.** HTTP and WebSocket both run on port 3100 via the custom server. No separate WebSocket port.
- **Password auth, not OAuth.** Solo developer, single user. JWT in httpOnly cookie, 7-day expiry.
- **Adversarial review routes work to either Codex (synchronous) or Claude (async via tmux send-keys).** Codex returns results inline; Claude sends the prompt to a different session.
- **This app is the executive/operator surface, not an unrestricted shell broker.** It must operate through declared environments, durable task/session state, explicit recovery actions, and review policy.
- **Ambient host credentials are not execution defaults.** Terminal and Codex execution should use scoped environments instead of inheriting the full process environment.
- **This app is also the meta-learning collector.** It should accumulate operational observations and expose recurring design pressure for offline synthesis.
- **Capability truth beats role claims.** If the app cannot reach a host-control surface, it must expose that honestly in the UI/API instead of silently implying full operator authority.

## Commands
- Dev: `npm run dev` (uses tsx for hot reload)
- Build: `npm run build` (runs `check` → Next build → tsc server)
- Start: `systemctl start command`
- Logs: `journalctl -u command --no-pager -f`
- **Deploy: `npm run deploy`** — build + restart + smoke. Never restart manually; use this so a broken build cannot silently serve traffic.
- Smoke only: `npm run smoke` — 13-check post-deploy verification.
- Pattern check: `npm run check` — blocks known bug-class patterns (e.g. `new URL(path, req.url)` behind a proxy).
- Meta scan: `npm run meta:scan` — reads telemetry, surfaces anomalies to `/opt/workspace/runtime/.meta/observations.md`. Runs hourly via `command-meta-scan.timer`.

## Observability contract
- Server telemetry: `/opt/workspace/runtime/.telemetry/events.jsonl` (append-only, structured).
- Client telemetry: `POST /api/client-report` — the login page beacons navigation state so we see what the browser actually resolved to. Closes the gap that made the mobile redirect bug invisible to the server.
- Anomaly summary: `/opt/workspace/runtime/.meta/observations.md` — regenerated hourly.

When a user reports a bug you can't reproduce with curl, check the beacon telemetry before theorizing.
