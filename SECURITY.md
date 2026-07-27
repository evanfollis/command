# Security policy

## Supported version

Security fixes target the current `main` branch and the immutable release
identified by Command's authenticated health endpoint. Historical releases and
prompt-evaluation archives are evidence, not supported runtime versions.

## Reporting

Use GitHub private vulnerability reporting for suspected vulnerabilities. Do
not open a public issue containing credentials, private owner data, unredacted
runtime evidence, or a working exploit against the hosted service.

Include the affected commit or release SHA, reachable route or component,
minimal reproduction, impact, and any evidence that distinguishes a source
defect from deployment or environment drift. Do not include real passwords,
tokens, signing keys, cookies, or private transcripts.

This is a personal project and does not offer a bug bounty. Good-faith,
non-destructive reports are welcome. Do not access data beyond your own
session, perform availability testing against the hosted service, or attempt to
pivot into the underlying workspace.

## Security invariants

Command is an authenticated read-only observatory. Reports that reintroduce or
expose agent dispatch, terminal control, lifecycle mutation, arbitrary process
execution, credential material in build artifacts, cross-release dependency
mixing, or private evidence through the public projection are treated as
security-boundary defects.
