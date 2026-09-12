# Review: 83edf48 — Harden authoritative Claude evaluation provenance

**Date**: 2026-09-12T05-10Z
**Reviewer**: Claude Sonnet 4.6 — adversarial substitute (Codex EROFS in headless tick session)
**Change type**: substantive
**Reviewed at cumulative target**: `cd1f65e4d3f5527ed8d1810834e8728e252f9b9f`
**Scope**: cumulative diff from 706894d to cd1f65e4d3f5527ed8d1810834e8728e252f9b9f: eval harness pins, security dependency updates, auth lockout hardening, portable eval provenance, observatory bounded reads, service identity ACLs, and credential boundary enforcement.

## Finding

New `prompteval_release_contract.py` and `prompteval_source_receipt.py`. The `validate_release` function reads the raw report JSON to cross-check the attempt log. The `attempt_log` field value is read from the report JSON without validating it is within `runtime_root`; if a crafted report JSON redirected the field, the attempt log read could be misdirected. Practically not exploitable since report is written by the controlled harness. The quorum contract test hardcodes the attempt log path while production reads it from the field. No blocking defect.

## Verdict

No blocking defect.

## Verification

Pre-merge gates verified at cumulative target `cd1f65e4d3f5527ed8d1810834e8728e252f9b9f`: lint, typecheck, all 20 contract tests (auth, health, bounded-file, claude-session, observatory, artifacts, symphony-projection, eval-telemetry, eval-source-pin, prompteval-config, prompteval-quorum, prompteval-safe-metadata, adapter-llm-contract, golden-contract, thread-opening-contract, repository-instructions-contract, review-prompt-contract, offline-synthesis-contract, codex-task-builder, service), repo:check all pass. npm audit reports 0 vulnerabilities. `make build` passes pending eval baseline commit.
