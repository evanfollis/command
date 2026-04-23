# CURRENT_STATE — command

**Last updated**: 2026-04-23T~18:05Z — Phase C1 deployed + pushed; 32/32 smoke green; ADR-0028 handoff filed; Phase C2/C3 scoping deferred per phase-c2-remaining handoff

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Auth**: password + JWT in httpOnly cookies (cookie-only)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. Pinned-origin redirect in `middleware.ts`.
- **Smoke**: 32/32 checks passing (3 new Phase C1 WebSocket checks). Deployed SHA: `cc2c481`.
- **Phase C1 live**: `/attach/general` and `/attach/general-codex` stream supervised tmux panes over WebSocket. Auth-gated. Read-only.

## What this is now
A focused executive surface with three jobs and nothing else:

1. **Executive chat** — multi-thread, one model per thread (Claude or Codex). Each thread is backed by a native resumable session: `claude --session-id <uuid>` on first turn, `--resume <uuid>` after; Codex captures session id via `~/.codex/sessions/` diff, resumes with `codex exec resume <uuid>`. Sidebar UI with `+ New thread` / rename / delete. Threads live in `/opt/workspace/runtime/.threads/<uuid>.meta.json` + `<uuid>.transcript.jsonl`. **Resumable from any terminal via CLI.**
2. **Portfolio** — each project card renders its `CURRENT_STATE.md` front door as markdown at full fidelity (no regex summary). Per-project metrics table (threads, compute, tokens across 1h/24h/7d/30d windows) rendered inline. Missing front doors surface as visible pressure ("front door missing or stale") — that's a feature.
3. **Operator tools** — collapsed `<details>`: ensure executive lane, recover session fabric. Appear only when capability attestation says operator is real.
4. **Artifact inbox** (`/artifacts`) — read-only, auth-gated markdown browser over a narrow code-path-only source allowlist. Sources: `research` (`runtime/research/`, recursive, `.md` only) and `syntheses` (`runtime/.meta/cross-cutting-*.md`, flat regex-filtered). See ADR-0028.

## What just completed (2026-04-23T~18:05Z, tick deploy + handoffs)
- **Phase C1 deployed and pushed** (`cc2c481` deployed, SHA confirmed in smoke; pushed `c7f20f8..cc2c481` to origin/main). 32/32 smoke green.
- **Adversarial review done** on Phase C1 (Claude agent — Codex EROFS still blocking tick sessions): `.reviews/65d3b26-phase-c1-review-2026-04-23T18-00Z.md`. No blocking findings. Non-critical items (JWT_SECRET DRY, redundant allowlist guard, no backpressure) documented for Phase C2/C3 cleanup.
- **ADR-0028 promotion handoff filed**: `runtime/.handoff/general-command-adr-0028-ready-2026-04-23T18-00Z.md`. This handoff was not filed by the prior session despite CURRENT_STATE claiming it was. Executive session must do the one-line edit.
- **Input handoffs consumed**: `command-session-topology-and-deploy-2026-04-23T17-05Z.md` + `command-freeze-root-cause-addendum-2026-04-23T17-30Z.md` + `command-phase-c-send-path-rewrite-2026-04-23T18-20Z.md`. Phase C1 was the maximum safe scope for this tick; C2/C3 deferred to `general-command-phase-c2-remaining-2026-04-23T17-55Z.md`.

## What just completed (2026-04-23T~18:00Z, Phase C1 prototype)
- **Read-only streaming attach** (`65d3b26`) for supervised tmux executives at `/attach/<name>`. Allowlist: `general`, `general-codex`. WebSocket endpoint at `/api/attach/<name>/stream` wired into `server.ts` upgrade handler with cookie-JWT auth verify and 2-entry allowlist. `attachReadStream` polls `tmux capture-pane` every 200ms and pushes snapshots on change. Initial snapshot pushed immediately. UI page renders the live pane behind existing middleware.
- **Zero-blast-radius scope**: does not touch `/sessions/[name]`, the home-page sidebar, or the `/api/threads/*` contract. The Live-stream button added to the disambiguation block is the only home-page diff.
- **JWT extracted**: verify + cookie-parse lifted to `src/lib/jwt.ts` (no Next imports) so `server.ts` can authenticate upgrade requests without pulling in the Next app context.
- **Smoke coverage**: 32/32 passing. Three new WebSocket checks — unauth'd ws → 401, allowlist miss → 404, authed ws delivers snapshot frame within 2s (473 bytes confirmed).
- **Not a full freeze fix**: C1 is read-only. `threadConversation.ts:116` (`execFileSync('claude', ['-p', '--resume', ...])`) still spawns per turn for ephemeral threads. Full rewrite — writer lock, reconnect replay, ephemeral thread ProcessPool, attach-surface picker UI, reasoning-level settings — scoped in `runtime/.handoff/general-command-phase-c2-remaining-2026-04-23T17-55Z.md` with precise designs.
- **Browser not verified**. FR-0015 cluster: server-side smoke covers ws mechanics; principal click-through on the live endpoint is still unverified.

## What just completed (2026-04-23T~17:45Z, topology stopgap)
- **Home-page disambiguation** (`93cd79e`): top of `/` now shows an amber "Supervised executive session" panel with a direct `https://claude.ai/code/session_*` link to the supervised `general` tmux instance. Copy on the threads panel renamed from "Executive / workspace executive" → "Ephemeral threads" to stop the framing collision that had the principal landing on the wrong surface.
- **Bridge URL surfacing**: new `src/lib/claudeSessions.ts` reads `/root/.claude/sessions/<pid>.json` (CLI-maintained per-PID state with `bridgeSessionId`) and correlates to tmux supervised PIDs via `tmux list-panes`. `/api/project-status` now returns `{pid, bridgeUrl, bridgeSessionId, conflictingPids}` per session. Portfolio cards link out to claude.ai per project. Ad-hoc claude instances at the same cwd as a supervised tmux session get flagged with ⚠ dup.
- **Health SHA** (`43b1275`): `/api/health` now includes the deployed commit SHA. `npm run build` writes `dist/.version`; health reads it with `git rev-parse HEAD` fallback for dev. Smoke asserts 40-char hex.
- **Freeze diagnosis confirmed** at `threadConversation.ts:116` (Claude) and `:161` (Codex): `execFileSync` spawns fresh `claude -p --resume` / `codex exec resume` per turn. Blocking, no streaming. Per-turn cost = process spawn + full JSONL replay. Full rewrite scoped in handoff `runtime/.handoff/general-command-freeze-fix-scoping-2026-04-23T17-45Z.md` — requires a product decision on whether ephemeral threads keep the current architecture or collapse into a streaming-attach onto supervised tmux.
- **ADR-0028 promotion handoff**: promotion handoff filed at `runtime/.handoff/general-command-adr-0028-ready-2026-04-23T18-00Z.md` (prior reference to a 17:30Z handoff was stale — that file did not exist). One-line status flip needed by executive session.
- **Pushed and deployed** (`cc2c481`): all 5 commits from this window pushed to origin/main and deployed. 32/32 smoke passing.

## What just completed (2026-04-23T~16:10Z, attended pass)
- **Cleanup pass executed**: committed the 6-cycle-stale reflection updates to `CURRENT_STATE.md`. Deploy gap closed (`npm run deploy` — build + restart + smoke; the only drift since `4b5261c` was a comment-only change in `page.tsx` from `8e63f97` and reflection doc updates in `194c720`, so this is a verification restart rather than a functional deploy). FR-0015 is unresolvable by any non-human path; the URGENT handoff is now surfaced to the principal directly in the session handback. ADR-0028 left at `proposed` — the general session holds charter authority for promotion; this project session is not that authority per note at the top of the ADR.

## What just completed (2026-04-23T14:23Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-23T14-23-20Z.md`): sixth consecutive quiet window — no commits, no user activity, no telemetry events. FR-0015 handoff filed at `runtime/.handoff/URGENT-command-fr0015-principal-decision-needed.md` — reflection loop will stop re-escalating after this. Attended-session cleanup pass still proposed (commit CURRENT_STATE.md, deploy, promote ADR-0028, close FR-0015). CURRENT_STATE.md now ~72h uncommitted (6 cycles).

## What just completed (2026-04-23T02:23Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-23T02-23-14Z.md`): fifth consecutive quiet window — no commits, no user activity, no telemetry events. All prior carry-forwards persist. CURRENT_STATE.md now ~60h uncommitted (5 cycles). FR-0015 10th cycle — now degrading signal quality. ADR-0028 >96h at proposed. Reflection proposes a 10-minute attended-session cleanup pass to close all five stale items at once.

## What just completed (2026-04-22T14:22Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-22T14-22-45Z.md`): fourth consecutive quiet window — no commits. One new signal: iPhone login-page view at 03:26Z (CriOS/147, navType "navigate", no referrer). No post-auth telemetry events — telemetry gap identified: client beacon covers login page load but not auth success or post-login navigation. All prior carry-forwards persist. CURRENT_STATE.md now ~36h uncommitted (4 cycles). FR-0015 9th cycle.

## What just completed (2026-04-22T02:24Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-22T02-24-07Z.md`): third consecutive quiet window — no commits, no user interaction. All prior carry-forwards persist. CURRENT_STATE.md has now been sitting uncommitted for ~24h (3 reflection cycles). Deploy gap still open (HEAD `194c720` vs deployed `4b5261c`). FR-0015 entering 8th cycle — reflection loop no longer adding signal; principal resolution needed. ADR-0028 stuck at `proposed` for >48h post-review.

## What just completed (2026-04-21T14:24Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-21T14-24-25Z.md`): quiet window — no commits, no user interaction. All carry-forwards from prior reflection still open. CURRENT_STATE.md sitting uncommitted on disk (prior reflection session updated it but could not commit). Deploy gap and FR-0015 URGENT persist.

## What just completed (2026-04-21T02:28Z, reflection pass)
- **Reflection pass** (`command-reflection-2026-04-21T02-28-12Z.md`): observed 3 commits from prior window. Deploy gap noted (HEAD 2 commits ahead of `4b5261c`). FR-0015 escalated to 6th cycle. ADR-0028 promotion still blocked on executive write access. Codex EROFS block flagged as structural (cross-project).

## What just completed (2026-04-20)
- **Adversarial review of artifact inbox** (this tick): Claude agent review (codex blocked by EROFS in tick sessions). Review at `.reviews/4b5261c-artifacts-review-2026-04-20T16-49Z.md`. Path-traversal guard confirmed sound. Three findings triaged as accepted tradeoffs. No blocking issues. ADR-0028 ready for `proposed → accepted` promotion — blocked only on supervisor directory being read-only from tick sessions; executive session must write the status change.
- **Artifact inbox landed** (`4b5261c`, prior session): `/artifacts` list + `/artifacts/<source>/<path>` doc view, behind existing auth. Server-side markdown render via `react-markdown` + `remark-gfm` + `rehype-slug` (heading anchors). Path-traversal guard uses `realpathSync` + `sep`-bounded prefix check. Nav has Artifacts link. Smoke extended with 6 new checks.
- **Retirement deferred**: `synaplex-inbox.service`, cloudflared `/_inbox/.*` path rule, `runtime/inbox/`, `inbox-render.py`, `inbox-server.py` intentionally left in place until the principal confirms the new route end-to-end.

## What just completed (2026-04-18, window ending ~17:00Z)
- **Mobile viewport fix** (`99704ef`): removed incorrect `viewport` export from `layout.tsx`, tightened `max-w` and padding in `page.tsx` and `PortfolioCard.tsx`. Now deployed and live.
- **CLAUDE.md M4 hook** (`e1f2303`): added `context-always-load: [CURRENT_STATE.md]` to CLAUDE.md for M4 session-start hook compatibility.
- **Metrics confirmed live**: `/opt/workspace/runtime/.metrics/` files exist and are being generated (13:34Z). `admin` key correctly maps to general session.
- **Deploy gap closed** (`c3aac72`): `npm run deploy` ran successfully. 20/20 smoke. All 7 undeployed commits (`e1fe263` through `c3aac72`) now live.
- **page.tsx committed** (`c3aac72`): delete-thread confirm dialog text clarified.
- **84b38dc adversarial review completed** (`cd541c5`): Codex review at `.reviews/84b38dc-review-2026-04-18T16-54Z.md`. No XSS (ReactMarkdown strips raw HTML without rehypeRaw). Auth is middleware-only (standard Next.js). State integrity findings are accepted single-process tradeoffs. 4-cycle carry-forward cleared.
- **check-patterns.ts already covers server.ts**: `scripts/check-patterns.ts:14-15` has `EXTRA_FILES = [server.ts]` — prior reflections filed this as open for 4 cycles incorrectly. Now confirmed closed.

## What completed (2026-04-17)
- Ripped out prompt-stitched `executiveConversation.ts`; built `threadConversation.ts` on native session IDs with per-thread in-flight lock.
- Added `/api/threads`, `/api/threads/[id]`, `/api/threads/[id]/messages`.
- Deleted `/orchestrate`, `/terminal`, `/telemetry`, `/meta`, and `/sessions` index. Backing APIs gone too. Terminal WS handler stripped from `server.ts`.
- Nav collapsed to logo + logout. No tab row.
- Portfolio reads each project's CURRENT_STATE.md directly (fallback: `supervisor/system/status.md` for general). `react-markdown` + `@tailwindcss/typography` render the front door.
- Smoke suite rewritten: 20 checks covering threads round-trip + project-status + auth + CSS.
- End-to-end verified server-side: Claude thread turn → CLI `claude --resume` recalled prior phrase. Same for Codex.
- **Thread-opening frame (ADR-0020)**: first-turn system prompt (`--append-system-prompt` for Claude, prepended message for Codex) orients executive threads toward action-default.
- **FR-0016 closed**: all three named symptoms addressed.
- **Metrics API + UI** (`e1fe263`, `ba9e6a3`): `/api/metrics/route.ts` + `/api/metrics/summary/route.ts` added. PortfolioCard renders per-project metrics table from `runtime/.metrics/*.json`. Producer is external (supervisor script); command reads only.
- **Thread frame tightened** (`59f3f7b`): frame now explicitly says cross-repo commits ship without asking.

## Known broken or degraded
- **`SESSION_TO_METRICS_KEY` contract (now documented)**: `page.tsx:7-13` hardcodes `{ general: 'admin' }`; any other session name maps to itself. Producer is `/opt/workspace/supervisor/scripts/lib/metrics-rollup.py`, scheduled by `metrics-rollup.timer` (hourly, `OnUnitActiveSec=1h`, `OnBootSec=2min`; `systemctl list-timers metrics-rollup.timer` to verify). Writes `/opt/workspace/runtime/.metrics/<window>.json` for windows `1h`, `today`, `24h`, `7d`, `30d`, `all`, plus `LATEST.json`. Key scheme is cwd-derived: `/opt/workspace`, `/opt/workspace/supervisor`, `/opt/workspace/runtime`, `/root` → `admin`; `/opt/workspace/projects/skillfoundry/*` → `skillfoundry`; `/opt/workspace/projects/context-repository` → `context-repo`; other `/opt/workspace/projects/<name>` → `<name>`; unmapped → `admin`. That's why the `general` session (rooted at `/opt/workspace`) maps to the `admin` key in the producer output, and why `SESSION_TO_METRICS_KEY` rewrites `general → admin` on the command side. Legacy `/opt/projects/*` paths are normalized to the `/opt/workspace/projects/*` equivalents inside the producer. Contract is now written down; if the producer ever renames `admin` or changes the cwd mapping, update both this file and `page.tsx`.
- **Single-process state integrity assumptions**: `threadConversation.ts` non-atomic transcript append (`57-63`), in-process-only turn lock (`194-200`), no durable error marker on crash (`207-209`). Safe ONLY while command runs single-process. If ever run multi-process, these become active data-corruption bugs. Accepted tradeoff — documented in `.reviews/84b38dc-review-2026-04-18T16-54Z.md:§3`.
- **Mentor and recruiter have no CURRENT_STATE.md**. Their portfolio cards show the missing-front-door message. Intended pressure signal — not a bug to paper over.
- **Client telemetry post-auth gap**: beacon fires on login *page load* and specific API events, but not on auth success or subsequent page navigation during a session. Mobile access (03:26Z iPhone visit) was visible but post-login behavior was invisible. If mobile becomes a first-class use case, add `client.auth_success` beacon to the auth API route and page-view beacons to `/` and `/artifacts`.

## Recent decisions
- **Native session IDs, not prompt stitching**: threads ARE Claude/Codex sessions, not UI buffers. Guarantees CLI resumability and feeds the reflection loop automatically.
- **One model per thread**: pinned at creation. No mid-conversation model swap.
- **Sidecar transcript for UI**: `<id>.transcript.jsonl` is the fast read path for the browser. Source of truth for the agent is still the native JSONL.
- **CURRENT_STATE.md rendered at full fidelity**: no regex extraction, no 140-char truncation.
- **Portfolio cards expand inline**: full CURRENT_STATE render + project-session chat.
- **Cookie-only JWT**: URL token fallback removed.
- **Pinned public origin**: never derive URLs from `req.url` behind cloudflared.
- **Thread frame tightened (59f3f7b)**: cross-repo commits and supervisor/system edits now classified as reversible — ship without asking. ADR-0020 full compliance. No separate ADR update filed.
- **Reflection self-check**: prior reflections filed `check-patterns.ts server.ts exclusion` as open for 4 cycles when it was already fixed. Any observation citing a specific file/line should be verified against current code before re-filing.

## Key routes
- `GET /api/threads` — list · `POST /api/threads` — create
- `PATCH/DELETE /api/threads/[id]` — rename / delete
- `GET/POST /api/threads/[id]/messages` — transcript / send turn
- `GET /api/metrics` — single-window metrics (reads `runtime/.metrics/<window>.json`)
- `GET /api/metrics/summary` — cross-window rollup by project
- `GET /api/project-status` — portfolio (sessions.conf + live/offline + last commit + full CURRENT_STATE.md content per project)
- `GET /api/sessions/[name]` — pane output for a project session
- `POST /api/send` — send keys into a project tmux session
- `GET /sessions/[name]` — full-screen project-session view (linked from portfolio cards)
- `GET /artifacts` — artifact inbox list · `GET /artifacts/[source]/[...path]` — doc view (markdown rendered server-side)

## Carry-forwards
- **FR-0015 Layer-3 proof** (HANDOFF FILED — 11th cycle): browser workflow with threads + portfolio needs real-device verification. Handoff at `runtime/.handoff/URGENT-command-fr0015-principal-decision-needed.md`. Two options: (a) test in a real browser (~15 min), (b) explicitly defer with rationale. Reflection loop is not re-escalating further.
- ~~**Document metrics producer** (URGENT — escalated)~~: **closed 2026-04-20T~16:55Z**. Producer is `supervisor/scripts/lib/metrics-rollup.py` on hourly `metrics-rollup.timer`; key scheme documented above under "Known broken or degraded." Both URGENT handoffs (`URGENT-command-metrics-producer-undocumented-2026-04-20T14-31Z.md` and `command-urgent-metrics-producer-2026-04-20T16-49Z.md`) are now actioned — safe to archive.
- **Review findings (accepted tradeoffs)**: Codex session ID race under concurrent thread creation, no durable error marker for failed turns, in-process-only turn lock. Acceptable for single-user single-process deployment. If command ever runs multi-process, these become real bugs.

## What the next agent must read first
1. This file.
2. `src/lib/threadConversation.ts` if touching Claude/Codex routing — it owns the native session id contract.
3. `src/lib/artifacts.ts` if touching the artifact inbox — source allowlist and path guard live here.
4. `.reviews/4b5261c-artifacts-review-2026-04-20T16-49Z.md` — adversarial review of artifact inbox with triaged findings.
5. `supervisor/decisions/0028-command-artifact-inbox-read-contract.md` if touching the `/artifacts` surface — source allowlist + read contract.
6. `src/components/PortfolioCard.tsx` if changing the project-inspection surface.

## Open carry-forwards
- **ADR-0028 promotion**: adversarial review done (`.reviews/4b5261c-artifacts-review-2026-04-20T16-49Z.md`). Executive session must edit `supervisor/decisions/0028-command-artifact-inbox-read-contract.md` status from `proposed → accepted` (supervisor dir read-only from tick sessions).
- **Principal confirmation of `/artifacts`** end-to-end on device. Once confirmed: retire the cloudflared `/_inbox` stopgap (`synaplex-inbox.service`, `/etc/cloudflared/config.yml` lines 7–10, `runtime/inbox/`, `inbox-render.py`, `inbox-server.py`). Do not delete source artifacts under `runtime/research/`.
- **FR-0015 URGENT**: browser-side verification of thread workflow needed from principal or attended session.
