# command

Executive front door for the synaplex workspace. Serves as the principal-facing
operator surface at `command.synaplex.ai` — executive chat threads, portfolio
dashboard, artifact browser, and host-side recovery without requiring SSH.

## Stack

- Next.js 14 (App Router, TypeScript, Tailwind CSS)
- Custom `server.ts` wrapping Next.js + WebSocket for live session attach
- Password + JWT auth (httpOnly cookie)
- Runs directly on host (not Docker) — needs access to tmux, docker, filesystem

## Key commands

```bash
npm run dev          # hot-reload dev server
npm run build        # type-check + Next build + tsc server.ts
npm run deploy       # build immutable release, swap current symlink, smoke
npm run smoke        # post-deploy verification (50 checks)
npm run check        # static pattern check (req.url anti-patterns)
npm run meta:scan    # telemetry anomaly scan → /opt/workspace/runtime/.meta/observations.md
```

## Architecture notes

See `CURRENT_STATE.md` for live operational state. See `CLAUDE.md` for active
architecture decisions. The service is always deployed from an immutable release
directory (`/opt/workspace/runtime/releases/command/current`); builds in the
working directory never affect the running process.

## Internal docs

- `CLAUDE.md` — active decisions and quality standards
- `CURRENT_STATE.md` — live project state (updated every tick)
- `.prompteval/` — governed prompt eval loops (ADR-0039)
- `.reviews/` — adversarial review artifacts per commit
- `docs/phase-d-design.md` — Phase D design (parked)
