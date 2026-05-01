# CURRENT_STATE — command

**Last updated**: 2026-05-01T09-30Z (tick — symphony-lite-orchestration) — Symphony-lite task state machine shipped: `GET/POST /api/symphony`, `GET/PATCH /api/symphony/:id`, `/symphony` UI page, Nav link, 10 new smoke checks (50/50 total), full demo verified (ready→running→review with telemetry). Pre-existing `browser-smoke.ts` TypeScript errors fixed as part of this deploy.

---

## Deployed / running state
- **URL**: command.synaplex.ai (Cloudflare Tunnel → localhost:3100)
- **Process**: runs directly on host (not Docker), managed by systemd
- **Auth**: password + JWT in httpOnly cookies (cookie-only)
- **Middleware**: `COMMAND_ORIGIN=https://command.synaplex.ai` in `.env.local`. Pinned-origin redirect in `middleware.ts`.
- **Smoke**: 50/50 checks passing — 10 new symphony round-trip checks added (create, list, ready→running, invalid transition, cleanup).
- **Live attach**: `/attach/general` and `/attach/general-codex` now support authenticated browser write, single-writer lock, take-write transfer, and reconnect replay.

## Capability gaps (machine-owned, not principal-owned)
- ~~**`browser_capability_missing`**~~: **CLOSED** (2026-05-01 tick). `@playwright/test` installed as devDependency; Chromium headless binary in `node_modules/playwright-core/.local-browsers/`. System libs (libnspr4, libnss3, libatk, etc.) bootstrapped to `/tmp/browser-libs/` via `npm run browser:setup`. 13-check browser smoke passes: form auth, home page session cards, portfolio card expansion (prose/pre rendered), `/attach/general` WS snapshot (8101 chars), `/attach/general-codex` WS snapshot (12933 chars), `/artifacts` h1 + source labels, zero JS errors. Run `npm run browser:smoke`. Re-run `npm run browser:setup` after host reboot (/tmp is ephemeral; node_modules chromium binary persists).
  - **Remaining narrow gap**: `/tmp/browser-libs` is ephemeral (reboot clears it). The `browser:setup` script re-downloads and re-extracts ~40MB of .deb files via apt. This requires network access to apt mirrors. If apt is unreachable post-reboot, browser smoke won't run until connectivity is restored. No impact on server-side smoke.


## What bit the last reflection / this tick
- **401 auth on prior ticks (resolved for attended sessions, unclear for unattended)**: `command.tick` at 00:51Z on 2026-05-01 failed with `401 authentication_error`. This attended tick (05:27Z) succeeded — 401 was likely the Anthropic API auth failure affecting unattended headless sessions; does not block attended work.
- **npm cache EROFS (ACTIVE)**: tick sessions cannot run `npm install` with the default cache path (`/root/.npm/_cacache`). Workaround: `NPM_CONFIG_CACHE=/tmp/npm-cache npm install ...`. Applied in this tick for `@playwright/test` install.
- **apt-get EROFS (ACTIVE for dpkg write)**: tick sessions cannot run `apt-get install` (dpkg cannot write to `/var/lib/dpkg`). Workaround: `apt-get --download-only` + `dpkg-deb -x` to /tmp. Applied in `scripts/browser-libs-setup.sh`.
- **advisor() pre-commit missing (10 reflection cycles unresolved, proposals suppressed)**: Rule proposed; still not added. Suppressed from proposals per saturation rule — remains here until decision filed.
- **Login double-submission**: class-mismatch confirmed 2026-04-25. Options A and B documented. 10 reflection cycles; suppressed from proposals per saturation rule. Terminal decision (A/B/won't-fix) still needed. See Known Broken.
- **ADR-0028 at 16+ cycles**: Still at `proposed`. Artifact inbox live since 2026-04-20. One-line status flip needed.
- **CURRENT_STATE.md uncommitted — 9 reflection cycles**: content is correct; disk-only. Reflection jobs cannot commit.

## What this is now
A focused executive surface with three jobs and nothing else:

1. **Executive chat** — multi-thread, one model per thread (Claude or Codex). Each thread is backed by a native resumable session: `claude --session-id <uuid>` on first turn, `--resume <uuid>` after; Codex captures session id via `~/.codex/sessions/` diff, resumes with `codex exec resume <uuid>`. Sidebar UI with `+ New thread` / rename / delete. Threads live in `/opt/workspace/runtime/.threads/<uuid>.meta.json` + `<uuid>.transcript.jsonl`. **Resumable from any terminal via CLI.**
2. **Portfolio** — each project card renders its `CURRENT_STATE.md` front door as markdown at full fidelity (no regex summary). Per-project metrics table (threads, compute, tokens across 1h/24h/7d/30d windows) rendered inline. Missing front doors surface as visible pressure ("front door missing or stale") — that's a feature.
3. **Operator tools** — collapsed `<details>`: ensure executive lane, recover session fabric. Appear only when capability attestation says operator is real.
4. **Artifact inbox** (`/artifacts`) — read-only, auth-gated markdown browser over a narrow code-path-only source allowlist. Sources: `research` (`runtime/research/`, recursive, `.md` only) and `syntheses` (`runtime/.meta/cross-cutting-*.md`, flat regex-filtered). See ADR-0028.
5. **Symphony task board** (`/symphony`) — local task state machine (Symphony-lite). Tasks move through `ready→running→review→done` (plus `blocked`/`deferred`). Bounded concurrency: 1 per project, 3 globally. State persisted in `runtime/symphony/tasks.json`. Stale detection: running >2h, review >24h. API: `GET/POST /api/symphony` + `GET/PATCH /api/symphony/:id`.

## What just completed (2026-05-01T09-30Z, tick — symphony-lite-orchestration)
- **Symphony-lite task state machine shipped** (`4b9f019`): `src/lib/symphonyStore.ts` with 6-state machine (`ready`, `running`, `blocked`, `review`, `done`, `deferred`), bounded concurrency (1 per project, 3 global), stale detection (2h running, 24h review), telemetry on every transition, full audit trail per task. State store at `runtime/symphony/tasks.json`.
- **API**: `GET/POST /api/symphony` + `GET/PATCH /api/symphony/:id`. Auth via existing middleware. Transition validation returns 422 with `code` field (`invalid_transition`, `concurrency_cap`, `not_found`).
- **UI**: `/symphony` page with stale warning banner, task rows with expand/collapse, state history, review artifacts, per-state transition buttons. "Symphony" Nav link added.
- **Smoke**: 10 new checks (50/50 total): unauthed redirect, create, list, ready→running, invalid-transition→422, cleanup.
- **Demo verified**: Task `479c8834` moved `ready→running→review` with `agentSessionId`, `worktreeIdentity`, `reviewArtifacts` fields — all persisted. Telemetry confirmed: 3 `symphony.transition` events emitted.
- **Adversarial review**: Claude agent (Codex EROFS). 3 findings: (1) concurrent write — accepted, synchronous single-thread pattern; (2) stale visibility — accepted, main list exposes `stale:boolean`; (3) unenforced blockedBy — accepted v1 design. Review at `.reviews/4b9f019-symphony-lite-review-2026-05-01T09-30Z.md`.
- **Pre-existing TypeScript bugs fixed**: `browser-smoke.ts` had `context.on('pageerror')` (wrong — context uses `weberror`; fixed to `page.on('pageerror')`) and `PASSWORD` non-null assertion. These were blocking the build.
- **Handoff consumed**: `command-symphony-lite-orchestration-2026-04-30T21-16Z.md` deleted.

## What just completed (2026-05-01T05:51Z, tick — browser-agent-legibility)
- **Browser smoke landed**: `@playwright/test` + Chromium headless installed. `npm run browser:smoke` runs 13-check browser verification: form auth flow, home page session cards, portfolio card expansion, `/attach/general` WS snapshot delivery (8101 chars), `/attach/general-codex` WS snapshot (12933 chars), `/artifacts` render, zero unhandled JS errors. 13/13 pass.
- **Three new scripts**: `scripts/browser-smoke.ts` (playwright tests), `scripts/browser-smoke-wrapper.sh` (env bootstrap — PLAYWRIGHT_BROWSERS_PATH must precede node startup), `scripts/browser-libs-setup.sh` (idempotent system dep download/extract to /tmp).
- **Adversarial review run**: Claude agent (Codex unavailable). Two ship-blocking findings fixed before ship: (1) WS evidence gap — added `waitForFunction` polling for pane content; (2) no JS error capture — added `context.on('pageerror')`. Two should-fix items also addressed: auth throw path now calls check() on failure; chromium binary check in wrapper.
- **Handoff consumed**: `command-browser-agent-legibility-2026-04-30T21-16Z.md` deleted.
- **Symphony-lite deferred**: `command-symphony-lite-orchestration-2026-04-30T21-16Z.md` is still present — deferred (medium priority, orthogonal scope requiring separate tick).

## What just completed (2026-04-25T09:30Z, tick — context-usage-ui, ADR-0030 item 4)
- **Context freshness badge shipped** (`ac762f7`): `GET /api/context-usage/[name]` — new endpoint parsing Claude Code JSONL transcripts. Returns `contextTokens` (last-turn input + cache_read + cache_creation), turn/tool counts, `freshness` (fresh/mid/stretched), `contextPercent` vs. 200K window.
- **Attach page badge**: `ctx 64% · stretched` badge in attach header, colored by freshness (green/amber/rose). Fetched once on WebSocket open, not polled.
- **Portfolio card badge**: `ctx N%` pill on executive sessions only. Fetched once on page load, not in the 15s project-status poll cycle.
- **Two bugs fixed before ship**: (1) `<synthetic>` model entries (session-end summaries with all-zero tokens) now skipped to prevent false "fresh" after compaction. (2) Supervised PID passed to session selection to prefer managed tmux session over co-located tick processes.
- **Adversarial review run**: Codex EROFS blocked — Claude agent review substituted. Two findings actioned (synthetic skip + supervised PID), two accepted as documented tradeoffs (200K conservative window, no staleness timestamp on badge).
- **Handoff consumed and deleted**: `command-context-usage-ui-2026-04-23T20-40Z.md` — this was previously deferred 2× due to Phase D parking conditions; executive's decision to run this tick is treated as explicit unpark of context-usage-ui from Phase D scope.

## What just completed (2026-04-25T02:00Z, tick — Phase D handoff housekeeping)
- **Phase D design conflict RESOLVED**: Prior tick preserved `command-phase-d-cowork-panels-2026-04-23T18-35Z.md` due to carry-forward conflict. This tick: design migrated to `docs/phase-d-design.md` (durable in project repo, not transient runtime handoff), handoff file deleted.
- **No code changes this tick**. No deploy needed. 40/40 smoke still current from prior deploy.

## What just completed (2026-04-24T20:51Z, tick — session routing hardening)
- **Session routing bug fixed** (`091ff74`): `page.tsx:299` now pins `supervisedExecutive` to `p.name === 'general'` first, with fallback to any `role='executive'` session. Eliminates the silent tie-break that would have quietly pointed the executive card at `general-codex` if `sessions.conf` order changed. Option A from topology analysis.
- **Nav Executive link shipped** (Option B from topology analysis): `Nav.tsx` now has an "Executive" link to `/attach/general` so the live attach surface is reachable from any page without returning to the home card.
- **PortfolioCard live-attach link fixed**: previous uncommitted change added an unconditional `/attach/${project.name}` link to ALL portfolio cards. Fixed to `project.role === 'executive'` guard — the attach allowlist only covers executive sessions; non-executive links led to a disconnected view.
- **bridgeUrl links removed**: executive card and portfolio cards no longer show conditional "open in claude.ai ↗" links (which required a live `bridgeUrl` that was often absent). Native attach is the primary surface.
- **Phase D handoff PRESERVED** — tick instructions said to delete `command-phase-d-cowork-panels-2026-04-23T18-35Z.md`, but CURRENT_STATE.md from prior tick explicitly said "NOT deleted — external-dependency block." Conflict surfaced to executive in completion report. Design preserved in handoff file pending executive decision.
- **Context-usage-ui** — still parked as Phase D scope (`command-context-usage-ui-2026-04-23T20-40Z.md`). Data available, attachment header option exists. Executive can unpark independently.
- **Login double-submission** — investigated telemetry: consistent fail+success pairs 8-21ms apart across multiple browser sessions (iPhone+CriOS, Mac+Chrome). Root cause: most likely browser/password-manager race condition, not server-side bug. Proposed client-side submit-once fix would not address this class. Left uninvestigated per advisor — the fix class doesn't match the root cause, and the user still successfully authenticates. Remains in known broken section.

## What just completed (2026-04-24T13:19Z, tick — handoff triage + topology analysis)
- **Session-topology routing analysis delivered**: `general-command-topology-analysis-2026-04-24T13-19-05Z.md` sent to executive. Identified `projects.find((p) => p.role === 'executive')` in `page.tsx:299` as a silent tie-break bug. Analysis shipped; code fix deferred to executive authorization (now shipped in the next tick above).
- **Phase D (cowork panels)** — parked. Parking conditions not met: Phase C3 unshipped, zero real-usage days, zero friction events.
- **Context-usage-ui** — parked. Scoped as Phase D right-panel work.
- **Phase C2 kickoff handoff deleted** — stale (C2 shipped at `edc3629`).

## What just completed (2026-04-24T13:00Z, Phase C2 ship)
- **Phase C2 shipped** (`edc3629`): `POST /api/attach/<name>/send`, in-memory single-writer lock (`src/lib/attachLock.ts`), take-write transfer with 10s decline window, reconnect replay from a 20-snapshot ring buffer, and upgraded attach UI with writer/observer states.
- **Reconnect race fixed before ship**: a stale socket close could evict a newer reconnect using the same `clientId`. `unregisterClient()` now verifies the exact `WebSocket` instance before releasing lock state.
- **Adversarial review recorded**: `.reviews/phase-c2-review-2026-04-24T13-00Z.md` documents the reconnect-lifecycle finding and the post-fix ship verdict.
- **Gate verification complete**: `npm run build`, `npm run smoke`, and a targeted reconnect lifecycle probe all passed before deploy.

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
- **Not the full freeze fix**: attach C2 is live, but ephemeral threads still use per-turn `execFileSync('claude', ['-p', '--resume', ...])` / `codex exec resume`. The process-pool rewrite remains separate follow-on work.
- **Browser not verified**: server-side smoke covers ws/auth/tmux mechanics. Real-browser end-to-end is unverified; tracked as the `browser_capability_missing` gap below, not as principal-owned work.

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
- **Login double-submission (reframed: telemetry-hygiene, not user-impacting)**: 57 fail+success pairs at 8–26 ms (median 15 ms), wrong password on fail / correct password on success. This is a password manager autofill race, not a click race. A client-component + disabled-button fix cannot reach concurrent autofill+Enter submits — confirmed class mismatch (2026-04-25T15:48Z, commit `0ec1c04`). The user always authenticates successfully. Real options: (A) meta-scan filter to suppress noise from telemetry (10-line change); (B) server-side dedup window within 30ms (stronger). Counter-handoff filed to general session. Not an active bug.

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
- `GET /api/context-usage/[name]` — context window freshness for a session (parses JSONL; Codex returns `available: false`)
- `GET /api/symphony` — list all symphony tasks (with `stale` computed) · `POST /api/symphony` — create task (state: ready)
- `GET /api/symphony/:id` — get task · `PATCH /api/symphony/:id` — transition state (validates allowed transitions, enforces concurrency cap)

## Carry-forwards
- ~~**FR-0015 Layer-3 proof**~~: reframed 2026-04-25 as the project-owned `browser_capability_missing` capability gap. **CLOSED 2026-05-01** — playwright + browser smoke implemented. Reflection loop must stop escalating this.
- ~~**Document metrics producer** (URGENT — escalated)~~: **closed 2026-04-20T~16:55Z**. Producer is `supervisor/scripts/lib/metrics-rollup.py` on hourly `metrics-rollup.timer`; key scheme documented above under "Known broken or degraded." Both URGENT handoffs (`URGENT-command-metrics-producer-undocumented-2026-04-20T14-31Z.md` and `command-urgent-metrics-producer-2026-04-20T16-49Z.md`) are now actioned — safe to archive.
- **Review findings (accepted tradeoffs)**: Codex session ID race under concurrent thread creation, no durable error marker for failed turns, in-process-only turn lock. Acceptable for single-user single-process deployment. If command ever runs multi-process, these become real bugs.

## What the next agent must read first
1. This file.
2. `src/lib/symphonyStore.ts` — the Symphony-lite state machine. Key constraints: synchronous withState (no locks needed for single-process), 1/project + 3/global concurrency cap, stale detection at read time. Owner model: `ownerSession` = tmux session name.
3. `scripts/browser-smoke.ts` + `scripts/browser-smoke-wrapper.sh` — browser-layer evidence. Key constraint: `PLAYWRIGHT_BROWSERS_PATH` must be set before node starts; shell wrapper handles this. `/tmp/browser-libs` is ephemeral.
4. `.reviews/phase-c2-review-2026-04-24T13-00Z.md` — ship review for the attach write path and reconnect lifecycle.
5. `src/lib/attachLock.ts` + `src/lib/attachStream.ts` — writer lock and replay buffer are the new attach control plane.
6. `src/lib/threadConversation.ts` if touching Claude/Codex routing — it owns the native session id contract.
7. `src/lib/artifacts.ts` if touching the artifact inbox — source allowlist and path guard live here.

## Open carry-forwards
- ~~**browser_capability_missing**~~: CLOSED (2026-05-01). `npm run browser:smoke` passes 13 checks. See Capability gaps section for narrow remaining limit (ephemeral /tmp libs).
- ~~**Context-usage-ui**~~: SHIPPED (`ac762f7`). Freshness badge on attach header + executive portfolio card. Handoff deleted.
- ~~**Symphony-lite orchestration**~~: **SHIPPED** (`4b9f019`, 2026-05-01). Handoff deleted. State machine live at `/symphony`, `GET/POST /api/symphony`, `PATCH /api/symphony/:id`. 50/50 smoke.
- **Phase D (parked)**: design preserved at `docs/phase-d-design.md`. Unlocks when: Phase C3 shipped + 3 days principal usage + 20 friction events.
- **ADR-0028 promotion**: adversarial review done (`.reviews/4b5261c-artifacts-review-2026-04-20T16-49Z.md`). Executive session must edit `supervisor/decisions/0028-command-artifact-inbox-read-contract.md` status from `proposed → accepted` (supervisor dir read-only from tick sessions).
- **Principal confirmation of `/artifacts`** end-to-end on device. Once confirmed: retire the cloudflared `/_inbox` stopgap (`synaplex-inbox.service`, `/etc/cloudflared/config.yml` lines 7–10, `runtime/inbox/`, `inbox-render.py`, `inbox-server.py`). Do not delete source artifacts under `runtime/research/`.
- ~~**FR-0015 URGENT**~~: reframed as the `browser_capability_missing` capability gap (now closed). Not principal work.
- **Login double-submission (reframed 2026-04-25T15:48Z)**: class-mismatch confirmed — client-component fix rejected. Real options: (A) meta-scan filter, (B) server-side dedup window. Counter-handoff sent to general. Not approaching URGENT — users authenticate successfully. See Known Broken section for analysis.
