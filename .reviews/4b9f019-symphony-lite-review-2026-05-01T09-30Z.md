# Adversarial Review — Symphony-lite orchestration

**Date**: 2026-05-01  
**Reviewer**: Claude agent (Codex unavailable — EROFS from tick session)  
**Commit**: 4b9f019  
**Files reviewed**: `src/lib/symphonyStore.ts`, `src/app/api/symphony/route.ts`, `src/app/api/symphony/[id]/route.ts`

---

## 1. Most dangerous assumption

The design assumes single-process Node.js cannot have concurrent state mutation. Lines 100-105 (`withState`) load-modify-save without synchronization primitives. Two simultaneous HTTP requests calling `transitionSymphonyTask` would both `readFileSync` before either `writeFileSync`, and the second write would overwrite the first.

**Verdict: Accepted tradeoff.** `withState` is fully synchronous — `readFileSync`/`writeFileSync` with no `await` between them means no event-loop yield point. Single-threaded Node.js serializes this without races. Identical pattern to `taskStore.ts` (pre-existing). If this app ever goes multi-process, this becomes an active bug — documented in both stores.

## 2. Missing failure mode

Stale tasks accumulate with no auto-resolution path. `staleSymphonyTasks()` is a utility function not directly surfaced as its own API endpoint.

**Verdict: Not a blocker.** Main `GET /api/symphony` returns all tasks with `stale: boolean` computed at read time. The `/symphony` UI renders a stale banner listing affected tasks by state/title. Stale tasks are visible. A dedicated `/api/symphony/stale` endpoint is a minor ergonomic gap, appropriate for v2.

## 3. Boundary most likely to collapse in practice

`blockedBy` / `dependsOn` fields are informational — the state machine permits `blocked → ready` transitions regardless of whether the blocking task is still running.

**Verdict: Accepted — by design.** v1 explicitly documents this at symphonyStore.ts line 19: "blocked → ready auto-resolution and depends-on graph are informational only." The enforcement boundary will need closing in v2 when depend-on graph proves useful in practice.

---

**Overall verdict**: No ship-blocking findings. Design is appropriate for single-process single-operator use. Three tradeoffs above are documented; none warrant blocking the ship. v2 backlog: dedicate `/stale` endpoint, enforce `blockedBy` at transition, consider file-level advisory locking if multi-process ever enters scope.
