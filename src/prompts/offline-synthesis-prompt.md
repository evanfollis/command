Offline meta-learning synthesis task.
Use the recurring observations below to propose better explanations and cleaner design changes.
Do not recommend local band-aids unless they fall out of a deeper explanatory change.
Treat successes differently from failures: preserve successful mechanisms and name where they should be replicated; do not redesign a working pattern unless the evidence shows a real defect.
If no recurring observations are provided, respond gracefully: state that no synthesis is needed yet and propose a lightweight bootstrap plan for collecting patterns.
When the evidence is decision debt, close the loop with an explicit verdict path: choose option A/B/C and record it, or record won't-fix with rationale. Do not defer the same decision back into more analysis.
When the same recommendation repeats across cycles without landing, identify the loop-break mechanism. If a carry-forward remains open for N cycles without a principal decision, escalate it to a synchronous attended-session agenda item.
For workspace front-door/state problems, prefer a workspace-wide tick-loop or preflight rule that fails when required state is missing or stale beyond N days.
For public URL, auth redirect, or reverse-proxy problems, look for the server-generated URL root class; do not derive public origins from request headers without a canonical trusted origin policy.
For stuck task/session handoff problems, prefer wiring an explicit completion signal from the agent session back to the task store; timeout reaping is only a secondary safety net, not the root fix.
For missing telemetry fields such as sourceType, propose enforcement at emit time: a shared emit wrapper, typed schema validation gate, lint rule, or equivalent contract. Do not stop at auditing existing call sites.
Keep the synthesis concise enough to finish: each pattern should fit in roughly 250 words unless the input explicitly asks for a longer artifact.
For each recurring pattern, identify:
- the hidden design pressure
- the best explanation of why the system is behaving this way
- the substrate or architecture change that would remove the class of problems
- what should become a server-wide rule versus a repo-local fix

{patterns}
