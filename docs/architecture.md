# Command architecture

## Purpose and shape

Command is a Next.js application with a minimal custom HTTP server. It is an
authenticated read-only observatory, not an agent runtime or control plane.
The browser surface reports typed evidence produced elsewhere in the Synaplex
workspace. Login/logout and their security telemetry are its only intentional
human-web writes.

Repository declaration: `shape = "application"`, `lifecycle = "active"`,
`agentic_risk = "model-assisted"`. The model-assisted classification comes
from offline governed prompt evaluation; the deployed web process does not call
models or dispatch agents.

## Composition roots

- `server.ts` starts Next through the production HTTP server on the configured
  port.
- `src/proxy.ts` enforces JWT authentication for every non-public route using
  the current Next.js 16 network-boundary convention.
- `src/app/` owns pages and HTTP route handlers.
- `src/components/` renders observatory signals without adding authority.
- `src/lib/observatory.ts` composes bounded typed collectors.
- `src/lib/*Projection.ts` and other collector modules read external evidence.
  Invalid or missing evidence remains an explicit typed `unknown`; valid
  partial records may be shown but are never relabeled as complete.
- `scripts/render-prompt.ts` renders historical governed prompts offline
  through pure builders. It is not reachable from the web application.
- `scripts/release.sh` builds a clean detached worktree into an immutable
  release and atomically changes the active pointer.

## Dependency direction

```text
pages/routes -> read-only collectors/contracts -> configured evidence paths
server       -> Next request handler
eval scripts -> pure prompt builders -> governed prompt files
release CLI  -> preflight/build/smoke -> systemd service
```

UI and route code may depend on read-only collectors. Collectors do not depend
on UI or deployment code. The web dependency graph must not contain agent
dispatch, tmux mutation, Symphony transition, task-store mutation, or arbitrary
process-spawn capabilities. `scripts/product-boundary-test.ts` enforces the
negative boundary and the route/method allowlist.

The former operator runtime was deleted from current source after remote
operation moved to Codex and Claude applications. Git history preserves its
lineage. The remaining review, Codex-task, and synthesis builders only format
governed historical prompt text and capture offline eval inputs.

## Artifact roles

| Role | Paths |
| --- | --- |
| authoritative | `src/`, `scripts/`, `docs/`, `deploy/`, `.prompteval/` |
| runtime | configured workspace runtime root; no repo-local runtime state |
| generated | `.next/`, `dist/`, `tsconfig.tsbuildinfo` |
| historical | `.reviews/`, prompt archives under `.prompteval/*/archive/` |

Runtime roots are resolved from `WORKSPACE_ROOT`, `PROJECTS_ROOT`,
`RUNTIME_ROOT`, `CLAUDE_STATE_ROOT`, and the narrower Command release/staging
overrides. Defaults preserve the hosted `/opt/workspace` topology. Immutable
release and service paths move only through a coordinated compatibility
cutover.

## Authentication and secrets

`JWT_SECRET` is read lazily at request time and has no fallback. Token signing,
server verification, and Next proxy verification use the same resolver.
Sessions pin HS256 plus a Command-specific issuer, owner audience, and owner
role; a same-key token minted for another purpose is not a Command session.
`next.config.js` does not expose the secret through the build-time environment
map. Every production build scans `.next` and `dist` for configured auth values
and the retired fallback without printing secret values. The build itself uses
fixed non-secret JWT/password canaries and scans their exact, base64, and hex
forms after removing trace/cache output. Artifact-route NFT manifests are
parsed and rejected if dynamic runtime reads retain repository files outside
the runtime package boundary.
The systemd environment file is root-owned and has no group/other access; the
service installer refuses to proceed when that ownership boundary is weaker.

The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and path-scoped to `/`.
Proxy redirects are relative or use the pinned public origin.
Password failures are throttled per Cloudflare-authenticated client address in
a bounded in-process window. Untrusted forwarded headers cannot select a
bucket, the client map is capped, successful authentication clears the bucket,
and no durable identity or session store is introduced.
All routes emit framing, MIME-sniffing, referrer, transport, and browser
capability restrictions; CSP fixes the base, form, frame, and object boundary
without relying on unstable generated script hashes.

## Deployment and rollback

The service runs from
`${COMMAND_RELEASE_ROOT:-$RUNTIME_ROOT/releases/command}/current`. Release
assembly happens in a detached Git worktree with dependencies keyed by the
staged lockfile digest. A release directory becomes immutable before the
`current` symlink changes atomically. Failed service/login or authenticated
smoke checks restore both the prior `current` and prior `previous` pointers,
then re-check health. Deploy, rollback, and service-policy installation share
one non-blocking host lock so concurrent operators or agents cannot interleave
release state.

Build and runtime use the checksum-pinned official Node 24 LTS toolchain at
`${RUNTIME_ROOT}/toolchains/node-24-current`; Command does not inherit the
host-wide EOL `/usr/bin/node`. `make runtime-setup` installs the declared
v24.18.0 archive without replacing runtimes used by other services.

The complete versioned unit is `deploy/command.service`. The installed unit is
changed through a canary comparison and daemon reload; the release script does
not silently rewrite service policy.

## Dedicated service identity

The web service runs as the system nologin `command` user with no Linux
capabilities or privileged supplementary groups. systemd loads the root-owned
runtime environment before applying the service identity; the process cannot
open the environment file itself. The workspace is read-only except for the
telemetry directory.

The installer applies read/default ACLs only to `/root/.claude/sessions`,
read-only ACLs to already-approved eval `runs/` projections, and a
write/default ACL only to the telemetry directory. Eval provenance,
transcripts, caches, and repository holdouts remain inaccessible; novel eval
trees fail closed until explicitly projected. tmux's server ACL makes read-only
clients unable to issue even observation commands; writable clients could
mutate sessions. The web service therefore receives no tmux socket, runs with
`PrivateTmp=yes`, and reports tmux-derived fields as typed `unknown`. It is
likewise not added to the Docker group: container evidence that cannot be
obtained without the root-equivalent Docker socket remains `unknown`.

Owner: workspace supervisor. Projection milestone: replace both unavailable
privileged sources with a sanitized supervisor-owned evidence file, then remove
the remaining `/root` traversal ACL.

## Verification

`make check` is the deterministic merge gate. `make build` adds the complete
Node 24 Next/server build, credential-canary scan, and artifact trace-boundary
check. `make deploy-check` adds immutable
release/rollback and shared preflight checks. Production closure requires
authenticated HTTP smoke, authenticated Chromium smoke, active release identity
matching the deployed commit, and a known previous release for rollback.
