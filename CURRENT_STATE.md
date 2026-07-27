# Command — Current State

**Updated:** 2026-07-27T09:00Z

Command is the private, authenticated owner observatory for the Synaplex
workspace. The legacy remote-operation product has been removed rather than
hidden.

## Production

- Status: active and intentionally pinned during migration
- Commit: `fde91bef34827c18572465b37557201fe7535eb1`
- Release:
  `/opt/workspace/runtime/releases/command/20260720T092611Z-fde91be`
- Public behavior: `https://command.synaplex.ai` redirects unauthenticated
  requests to `/login`
- Last accepted browser receipt:
  `/opt/workspace/runtime/browser-smoke/2026-07-20T09-24-59/`

No migration candidate is eligible for production until its governed prompt
evaluation, opposing review, CI, authenticated canary, and rollback gates all
pass.

## Migration candidate

The `migration/adr-0050-repo-standard` branch now implements the July 2026
repository and agentic-system profile:

- canonical `AGENTS.md`, `CLAUDE.md`, `README.md`, `repo.toml`, `Makefile`,
  architecture documentation, test-collection witness, CI, CodeQL, and
  dependency-update policy;
- a dedicated nologin `command` service identity with a root-loaded runtime
  environment, no Linux capabilities, no root-equivalent groups or sockets,
  narrow read ACLs, a telemetry-only write ACL, and bounded systemd resources;
- immutable checksum-addressed releases, serialized release/rollback/service
  installation, atomic pointer recovery, authenticated intended-release and
  rollback verification, and retained failure evidence;
- runtime-only owner credentials, explicit JWT issuer/audience/role claims,
  bounded trusted-proxy login throttling, constrained browser resource origins,
  and a documented owner-password rotation exception;
- bounded, no-follow, change-detecting evidence readers with typed degradation
  for inaccessible or malformed sources;
- five versioned prompt-evaluation loops and a payload-free run metadata reader.
- portable clean-checkout prompt contracts, worktree-confined golden
  generation, stable-source release-eval receipts consumed by preflight and
  observability, and evaluator-only sealed definitions denied to the service
  identity by both filesystem mode and systemd namespace policy.

The current owner password remains unchanged. Its eight-character length is a
dated, controlled exception pending secure owner handoff; the value has not
been printed, copied, or embedded in build artifacts.

## Product and authority boundary

The retained human surfaces are the owner observatory, evidence lineage,
artifacts, read-only Symphony lifecycle evidence, and login. Retained APIs are
authenticated read-only health, metrics, eval, project-status, context-usage,
and Symphony reads. Login and logout are the only intentional browser
mutations.

Operator tools, terminal attach, sessions, messaging, review dispatch,
executive recovery/control, conversation threads, client beacons, and Symphony
mutations are absent. Deployment smoke requires retired pages and APIs to
return 404 and Symphony mutation methods to return 405.

The web process receives no tmux or Docker socket access. Evidence that cannot
be projected without root-equivalent authority is reported as typed `unknown`;
the observatory is not an alternate operator surface.

## Current gate

The migration is not yet releasable. A failed sealed Codex-task case was
mechanically promoted to active before its output was inspected, and a later
metadata-inspection command exposed the two surviving sealed definitions.
Those records are preserved as contaminated evidence. An independent
Anthropic Opus clean-room author and separate no-tool auditor have approved and
sealed three fresh, non-derivative replacements from public coverage gaps.
Four independent opposing-review passes have driven remediation. The latest
pass identified a second sealed-data path through raw runtime run reports and
a legacy-canary incompatibility in the new receipt smoke. Raw evaluator runtime
evidence is now wholly inaccessible to the service identity; the UI projects
only payload-free accepted baselines, and the exact pinned predecessor has a
named, version-scoped smoke allowance. Production remains pinned while those
changes receive a fresh independent re-review and the full stable-source
18-case run completes, until:

1. a full uncached 18-case release evaluation passes with no unknown verdicts;
2. the complete branch receives an independent opposing Anthropic review and
   all findings are resolved;
3. local gates, GitHub CI, CodeQL, dedicated-identity canary, immutable release,
   authenticated HTTP/Chromium verification, and rollback proof pass.
