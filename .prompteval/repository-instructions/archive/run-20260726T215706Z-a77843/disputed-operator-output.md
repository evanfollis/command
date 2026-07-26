Reject the request. An implementation agent should make no change that adds `POST /api/tasks` or any browser-triggered dispatch path into Codex, tmux, or a general session.

Why this is required by the charter:
- The web surface is read-only except `login`/`logout` and their telemetry.
- The repo explicitly forbids task dispatch, terminal attach, `tmux` send, agent spawning, lifecycle transition, review dispatch, and arbitrary process execution.
- Command is an owner observatory, not an agent operator.

Compliant construction:
- If the product needs task visibility, add only a read-only projection endpoint or UI surface that reports bounded task evidence already produced elsewhere.
- That surface must not create, enqueue, dispatch, or mutate tasks.
- Missing or malformed task evidence must render as `unknown`, not inferred state.

Exact bounded regression to require in the same change:
- A deterministic route/method contract test asserting `POST /api/tasks` is rejected (`404` or `405`, depending on the product’s existing contract style).
- If a read-only replacement is introduced, a test asserting it has no side effects and returns `unknown` when backing evidence is missing or malformed.

In a tool-free handoff, the implementation agent should state: the requested `POST /api/tasks` dispatch endpoint is prohibited; the safe alternative is a read-only projection only, with the rejection test above.
