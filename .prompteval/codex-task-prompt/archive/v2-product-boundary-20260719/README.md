# Retired Codex-task active cases — product boundary correction

Retired: 2026-07-19
Reason: Command removed the legacy attach runtime while becoming a read-only owner observatory. The two active cases referenced `src/lib/attachLock.ts`; retaining a fake production module for an evaluator would invert the product boundary.

`attachLock.ts` is the exact pre-retirement source from commit `db026ba`. `retired-cases.jsonl` preserves the two active case records as they existed immediately before replacement. These are historical active-case evidence, not sealed holdouts and not inputs to current generation.

Replacement strata:
- already-fixed detection now targets the landed recent-change project-title correction in `src/lib/observatory.ts`;
- exact small edit now targets an explanatory comment at the exact public-path match in `src/middleware.ts`.

The sealed Codex-task holdout was neither opened nor modified.
