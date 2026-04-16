# CURRENT_STATE — command

**Last updated**: 2026-04-16 — seeded by executive (general session)

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd or manual start
- **Last known commit**: clean orphan branch pushed to github.com:evanfollis/supervisor.git (wrong — command has its own repo, check `git remote -v`)
- **Auth**: password + JWT in httpOnly cookies
- **Middleware**: fixed — was crashing with `TypeError: Invalid URL, input: '/login'` due to relative Location headers in Edge runtime. Fix: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`, `NextResponse.redirect(new URL('/login', origin))` in middleware.ts

## What's in progress
Two handoffs pending execution:

1. `command-telemetry-schema-s1-p2-2026-04-16T12-00Z.md` — Add `sourceType` field to all telemetry events. Required: TypeScript passes, all call sites updated, rotation script at `scripts/rotate-telemetry.sh`.

2. `command-homepage-redesign-2026-04-16T12-30Z.md` — Significant redesign: Claude/Codex agent selector, project status strip (one row per session from sessions.conf), PM plug-in page at `/sessions/[name]`, simplified layout (remove capability grid from default view, collapse operator tools). 5 acceptance criteria, must pass smoke test.

## Known broken or degraded
- Unknown current runtime state — verify `curl -s https://command.synaplex.ai/api/health` before assuming anything
- `check-patterns.ts` enforces URL safety — tests must run to verify it still passes after changes

## Blocked on
- Nothing currently. Both handoffs are self-contained.

## Recent decisions
- **Middleware redirect uses pinned origin**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`, exposed via `next.config.js`. Do NOT use `req.url` or `req.headers.host` as base URL — this was the root cause of the 500 crash.
- **`check-patterns.ts` ban narrowed**: The pattern ban was `NextResponse.redirect(new URL(` (too broad). Narrowed to ban only when `req.url`/`req.headers` is the base arg. Do not widen it back.
- **Git history was wiped**: The repo was initialized from an orphan branch (`clean-main`) to remove large files (Next.js binary artifacts) from history. The original dirty commit history is gone.
- **`claude -p` flag verified**: Non-interactive execution works. Use `claude -p` (not `--print`) for headless runs.

## What bit the last session
- `node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node` (125MB) was accidentally committed initially — git push failed. Had to create clean orphan branch.
- Edge runtime URL polyfill processes the `Location` header by calling `new URL(h, {})` — relative paths throw. The fix is not "use relative paths" — it's "use absolute paths with a pinned origin."
- `check-patterns.ts` was checking builds and blocked valid code at first. Read it before adding any new URL patterns.

## What the next agent must read first
1. Read `src/middleware.ts` to understand the current auth redirect logic before touching it
2. Read `src/app/api/executive/route.ts` — the POST handler is the core message path for the homepage redesign
3. Run `npm run build` first to confirm the baseline compiles before making changes
4. The `sessions.conf` that drives the project status strip lives at `/opt/workspace/supervisor/scripts/lib/sessions.conf` — it's on the host filesystem, the Node process can read it directly
