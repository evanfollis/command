# Command credential rotation

## Current exception

As of 2026-07-27, the configured owner password is eight characters. Its value
was not read, printed, copied, committed, or changed during the July migration.
Rotating it without an agreed secure handoff would lock out the owner, so the
existing value is a documented temporary exception rather than an implicit
claim that it meets the desired strength.

Compensating controls are:

- the service listens on loopback and is reached through the Cloudflare tunnel;
- failed logins are limited to eight attempts per five-minute client window;
- only Cloudflare's authenticated connecting-address header selects a client
  bucket; untrusted forwarded headers do not;
- successful sessions require the runtime-only Command issuer, owner audience,
  owner role, and pinned signing algorithm; and
- the root-owned environment file is mode-restricted and unreadable by the
  service identity.

Rotate before expanding the audience, exposing a direct listener, or weakening
any compensating control.

## Owner-coordinated rotation

1. Put a randomly generated password of at least 20 characters in the owner's
   password manager. Do not send it through Git, a task prompt, shell history,
   telemetry, logs, or a review artifact.
2. From an interactive root session, edit only `COMMAND_PASSWORD` in
   `/opt/workspace/projects/command/.env.local`. Keep the file owned by
   `root:root` with no group/other permissions.
3. Restart `command.service`. Editing an environment file does not alter the
   environment of an already-running process.
4. In a fresh private browser session, verify the new password establishes a
   session and the authenticated home, health, eval, artifact, and Symphony
   surfaces load. In a second fresh session, verify the retired password is
   rejected. Never put either value in automated output.
5. Record only the rotation timestamp, service release SHA, and pass/fail
   outcomes. Do not record either credential or a reversible derivative.

If the new credential cannot authenticate, restore the prior value from the
owner's password manager through the same root-only editor, restart the
service, and verify recovered authenticated health. Credential rollback does
not require a code or immutable-release rollback when the release identity is
unchanged.
