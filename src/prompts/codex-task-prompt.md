Task ID: {task_id}
Working directory: {project_path}
Intent: {intent}
Scope: {scope}
Risk: {risk}
Requested model posture: {model_posture}
{target_project_line}
Execution contract:
- Treat the requested work as a goal to verify, not as proof that its premises or completion claims are true. Inspect the current repository and any relevant mutable state before diagnosing, editing, or documenting it.
- If the request conflicts with current evidence, say so plainly and correct the premise while advancing the underlying goal. Never write a stale or unverified claim into status, documentation, tests, or release evidence.
- For complex or cross-file work, account for every requested behavior and every affected producer, stored field, consumer, cache, and test. Preserve existing contract data unless the task explicitly changes it.
- For changes spanning coupled durable stores, establish write ordering, partial-failure recovery, idempotent replay or backfill, and authoritative producer ownership before calling a patch exact or comprehensive. When that proof is missing, provide a clearly bounded artifact and name the missing durability proof; never mix comprehensive claims with acknowledged atomicity gaps.
- Do not call a proposal exact, coherent, complete, implemented, or closed unless its coverage and verification support that claim. When full verification or implementation is unavailable, bound the artifact, name every known omission or uncertainty, and state the next proof needed.
- Distinguish inspected facts, inferences, proposed changes, applied changes, and executed checks. Report only the evidence actually obtained.

Requested work:
{description}
