# Command — Owner Observatory

context-always-load:
  - CURRENT_STATE.md

## What this is

Command is the principal's authenticated, read-only internal health observatory for the Synaplex workspace. It answers what changed, what is blocked, whether diagnosis is becoming closure, and whether public/private projections, automation, evals, deployment, and publication remain coherent.

Codex and Claude applications own remote operation. Command must not expose terminal attach, session messaging, agent-thread conversation, review dispatch, executive recovery, task creation, or lifecycle mutation through the human web surface.

## Architecture

- Next.js App Router with a minimal HTTP-only custom server on port 3100.
- Password/JWT authentication. Login (`POST /api/auth`) and logout (`DELETE /api/auth`) are the only intentional human web mutations.
- All observatory, lineage, artifact, health, eval, metrics, project-status, context-usage, and Symphony web reads require authentication.
- Symphony data is a read-only lifecycle/closure projection. Its producer remains outside the human web surface.
- Runs from immutable releases under `/opt/workspace/runtime/releases/command/`; a release must own lockfile-matched build/runtime dependencies.

The route and method allowlist is authoritative in `docs/product-boundary.md` and mechanically enforced by `scripts/product-boundary-test.ts` during `npm run check` and `npm run build`.

## Internal prompt-eval boundary

Prompt builders and their historical execution helpers under `src/lib/` remain source dependencies of `scripts/render-prompt.ts` and the governed `.prompteval/` loops. Retired source specimens belong under the prompt archive, never under `src/`. This machinery must not acquire web routes. Do not change governed prompts, holdouts, or accepted baselines as a side effect of product-surface work; active cases may be versioned when product reality invalidates them, with explicit archive provenance.

## Quality constraints

- Typed evidence only. Missing contracts produce `unknown`, never heuristic health.
- Public projection integrity and domain health are separate signals.
- Never infer frozen gates, invariants, owner authority, or active pressure from unrelated counts or prose.
- Never derive public origins from request headers behind the reverse proxy; redirects stay relative or use pinned configuration.
- Preserve immutable release and rollback guarantees. Do not deploy from a dirty or dependency-mismatched tree.
- Browser verification must authenticate, exercise the real rendered surface, assert removed legacy routes return 404, and report JS errors.

## Commands

- `npm run check` — recurring pattern and product-boundary gate.
- `npm run observatory:test` — collector and projection semantics.
- `npm run build` — checks, Next production build, and server compilation.
- `npm run smoke` — authenticated HTTP/read-only route verification.
- `npm run browser:smoke` — authenticated Chromium verification.
- `npm run release:test` — cross-version immutable release and rollback regression.
- `npm run deploy` — immutable deployment; only when explicitly authorized and all prompt-eval gates pass.
