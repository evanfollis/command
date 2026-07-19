# Retired active contract: gc-3b64928414ae568a

This file preserves the exact active-case bytes consumed by fresh release run
`run-20260719T181501Z-caf280`. The case remains active in v2 with corrected
input evidence and grading semantics; this archive prevents the invalid v1
contract from being silently rewritten.

Provenance:

- Archived case SHA-256: `92f536b04fb8da46cf4136bc323ee1ff8169136268c83481329b35c39b8b6e23`
- Failed run SHA-256: `1761d5c9f80ea89da752163761ca23c76eadd4e47a34ee1be53787ee2096350e`
- Cached answer SHA-256: `4509b3eb91e8e0e136cc10ad1f83df57d40e041d6639bee0371063cb0a8c9eae`
- Run golden hash: `gh-80e22336b8b8ca1e`
- Run spec hash: `sh-85244569411ef570`
- Run prompt version: `pv-1f7cc1fc93b21773`
- Result: fresh release, cache disabled, aggregate 0.9286; this was the only
  failed must-pass case.

Why v1 was unsound:

- Its input established only a CriOS 401 symptom after login.
- Its rubric nevertheless required reverse-proxy-derived public URLs as the
  root cause and a workspace-wide header-origin rule.
- Current code already pins redirects to `COMMAND_ORIGIN`, uses relative
  login responses, and has a deterministic pattern check against deriving
  public origins from request headers.

The cached response correctly rejected the forced proxy explanation, but its
replacement theory is not accepted as truth. It asserted unverified WebKit
cookie behavior and proposed a process-local, UA-keyed, success-only dedup map.
That map cannot deduplicate the observed failed+successful pair, conflates
clients sharing a UA, resets across processes/restarts, and can return a
successful redirect without issuing a token. Contract v2 therefore grades
evidence-bounded causal reasoning and a discriminating observation path rather
than either speculative answer.

The sealed holdout was neither read nor modified during this correction.
