# CURRENT_STATE — command

**Last updated**: 2026-04-17T18:30Z — consolidation pass (threads + portfolio)

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Auth**: password + JWT in httpOnly cookies (cookie-only)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. Pinned-origin redirect in `middleware.ts`.
- **Smoke**: 20/20 checks passing.

## What this is now
A focused executive surface with three jobs and nothing else:

1. **Executive chat** — multi-thread, one model per thread (Claude or Codex). Each thread is backed by a native resumable session: `claude --session-id <uuid>` on first turn, `--resume <uuid>` after; Codex captures session id via `~/.codex/sessions/` diff, resumes with `codex exec resume <uuid>`. Sidebar UI with `+ New thread` / rename / delete. Threads live in `/opt/workspace/runtime/.threads/<uuid>.meta.json` + `<uuid>.transcript.jsonl`. **Resumable from any terminal via CLI.**
2. **Portfolio** — each project card renders its `CURRENT_STATE.md` front door as markdown at full fidelity (no regex summary). Inline project-session chat (pane output polling + send) inside each expanded card. Missing front doors surface as visible pressure ("front door missing or stale") — that's a feature.
3. **Operator tools** — collapsed `<details>`: ensure executive lane, recover session fabric. Appear only when capability attestation says operator is real.

## What just completed (2026-04-17 consolidation)
- Ripped out prompt-stitched `executiveConversation.ts`; built `threadConversation.ts` on native session IDs with per-thread in-flight lock.
- Added `/api/threads`, `/api/threads/[id]`, `/api/threads/[id]/messages`.
- Deleted `/orchestrate`, `/terminal`, `/telemetry`, `/meta`, and `/sessions` index. Backing APIs gone too. Terminal WS handler stripped from `server.ts`.
- Nav collapsed to logo + logout. No tab row.
- Portfolio reads each project's CURRENT_STATE.md directly (fallback: `supervisor/system/status.md` for general). `react-markdown` + `@tailwindcss/typography` render the front door.
- Smoke suite rewritten: 20 checks covering threads round-trip + project-status + auth + CSS.
- End-to-end verified server-side: Claude thread turn → CLI `claude --resume` recalled prior phrase. Same for Codex.

## Known broken or degraded
- **Mentor and recruiter have no CURRENT_STATE.md**. Their portfolio cards show the missing-front-door message. That is the intended pressure signal — not a bug to paper over.
- **Advice-vs-action gap in the chat surface**: first real use showed both Claude and Codex threads producing diagnosis without commits/edits. Agents end in "you should..." rather than acting and reporting. Root cause: native session default prompts orient toward analysis; the executive thread is a steering surface that should default to action. Next investigation: inject a short thread-opening system framing on thread creation.

## Recent decisions
- **Native session IDs, not prompt stitching**: threads ARE Claude/Codex sessions, not UI buffers. Guarantees CLI resumability and feeds the reflection loop automatically (sessions land in paths the reflect.sh job already scans).
- **One model per thread**: pinned at creation. No mid-conversation model swap — matches how Claude/Codex UIs themselves work.
- **Sidecar transcript for UI**: `<id>.transcript.jsonl` is the fast read path for the browser. Source of truth for the agent is still the native JSONL.
- **CURRENT_STATE.md rendered at full fidelity**: no regex extraction, no 140-char truncation. The front door is the source; drift becomes visible.
- **Portfolio cards expand inline**: full CURRENT_STATE render + project-session chat. Dedicated `/sessions/[name]` kept as deep link.
- **Cookie-only JWT**: URL token fallback removed.
- **Pinned public origin**: never derive URLs from `req.url` behind cloudflared.

## Key routes
- `GET /api/threads` — list · `POST /api/threads` — create
- `PATCH/DELETE /api/threads/[id]` — rename / delete
- `GET/POST /api/threads/[id]/messages` — transcript / send turn
- `GET /api/project-status` — portfolio (sessions.conf + live/offline + last commit + full CURRENT_STATE.md content per project)
- `GET /api/sessions/[name]` — pane output for a project session
- `POST /api/send` — send keys into a project tmux session
- `GET /sessions/[name]` — full-screen project-session view (linked from portfolio cards)

## Carry-forwards
- **Advice-vs-action gap** (see above). This is the structural shape to break next.
- **FR-0015 Layer-3 proof**: browser workflow with threads + portfolio verified from a real device. Server-side round-trip is proven; user-side browser confirmation is the remaining evidence.

## What the next agent must read first
1. This file.
2. `src/lib/threadConversation.ts` if touching Claude/Codex routing — it owns the native session id contract.
3. `src/components/PortfolioCard.tsx` if changing the project-inspection surface.
4. `/opt/workspace/projects/context-repository/docs/agent-context-repo-pattern.md` — the canonical front-door spec this UI surfaces.
5. `/review` is still required before closing any tick that touches ≥3 files or adds ≥100 lines.
