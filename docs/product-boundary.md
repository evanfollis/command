# Command product boundary

Command is an authenticated owner-health observatory. It does not operate agents. The Codex and Claude applications are the remote-operation surfaces.

## Human pages

| Route | Purpose | Mutates state |
| --- | --- | --- |
| `/login` | Establish the authenticated session | Authentication only |
| `/` | Bounded owner-health summary | No |
| `/lineage` | Evidence and artifact lineage | No |
| `/artifacts` and `/artifacts/:source/:path.md` | Bounded artifact browsing | No |
| `/symphony` | Typed lifecycle and closure history | No |

All routes except `/login` require the Command JWT.

## HTTP APIs

| Method and route | Purpose |
| --- | --- |
| `POST /api/auth` | Login |
| `DELETE /api/auth` | Logout |
| `GET /api/health` | Runtime/build identity |
| `GET /api/metrics` | Read-only metrics projection |
| `GET /api/metrics/summary` | Bounded metrics summary |
| `GET /api/evals/summary` | Bounded eval evidence |
| `GET /api/project-status` | Read-only declared project/session status |
| `GET /api/context-usage/:name` | Read-only context pressure |
| `GET /api/symphony` | Read-only lifecycle records |
| `GET /api/symphony/:id` | Read-only lifecycle record |

Every API except authentication requires the Command JWT. Non-GET methods on observability APIs are absent and must return 404 or 405 without changing state.

## Removed product classes

The following are intentionally absent, not hidden: operator-tools navigation, terminal/tmux attaches, WebSocket streams, session panes, message send, browser client-report ingestion, executive ensure/recover/thread actions, adversarial-review dispatch, conversational threads, and Symphony create/transition controls.

`scripts/product-boundary-test.ts` prevents route files, links, WebSocket runtime imports, tmux mutation imports, and retired terminal dependencies from returning to the web surface. HTTP and Chromium smoke tests prove the removed routes are unavailable to an authenticated user.

## Internal machinery

The prompt-eval renderer imports pure governed prompt builders. These builders
format text and capture eval inputs only; they cannot dispatch a task, control
tmux, spawn an agent, change lifecycle state, or write an operator store.
Command's former operator runtime was removed from the source tree and remains
available through Git history. Codex and Claude applications own remote
operation.

The web process imports a read-only tmux observer and a read-only Symphony
projection. The product-boundary test fails if tmux send/session-mutation
capabilities, Symphony create/transition functions, filesystem mutations, or
generic process spawning re-enter the web dependency surface. Bounded host
collectors may execute only fixed argument-vector reads; they do not accept
commands from requests or invoke a shell. Invalid Symphony records are omitted
with typed `unknown` evidence, and failed host reads remain `null`; neither is
presented as a healthy zero or empty store. Retired source specimens and
superseded active cases live under `.prompteval/<id>/archive/`, never under
`src/`.
