# Codex task prompt v2 feedback run 318ec6

Fresh release run `run-20260719T183312Z-318ec6` passed all three sealed
holdouts and failed three of twelve active cases. The holdout contents are not
copied or described here.

Provenance:

- Run SHA-256: `91eaf1a693171c4f42d8a7ef9d4fbb0e7875fec3f014ab51bbb47ddc279a6fc3`
- Golden hash: `gh-44ad5c64f3ef2fa7`
- Spec hash: `sh-33de56c408b2aec7`
- Prompt version: `pv-6ce30f7ee75fbd87`
- Fresh release, cache disabled, aggregate 0.8

Active failure evidence:

- `gc-0208a8225000a225`, cache `ck-29cfd28dc657227b`, SHA-256
  `0b0f6b038ce76d325faff481c735afe8a92dcafe8577f1d055e40110c414724f`:
  followed a false documentation premise despite the repository explicitly
  saying the gate remained fail-closed.
- `gc-dacb6094a0651bd4`, cache `ck-934d8d108dbb9821`, SHA-256
  `09c96bc3a71ff64682a282ec4d65b309d350469b065c9516cf8a0c40dc22430c`:
  presented a cross-file proposal as complete while narrowing transition
  metadata to selected fields and leaving lazy UI audit state stale after a
  transition.
- `gc-466822e89b2392f2`, cache `ck-8afb997fffdf4f0d`, SHA-256
  `d3c77295d6f1d5835af64b8086055c66b3b409770645be8074b12d6dc7797612`:
  passed the two common judges. Its source-grounding judge tied one pass, one
  fail, and one unknown because the rubric required a correction for an
  “actual empty-array failure class” even though the response correctly showed
  that a genuine empty array is valid and instead identified the reachable
  truthy-non-array persisted-state risk.

Disposition:

- Treat the first two as prompt-quality feedback: dispatched agents must verify
  mutable premises and must not claim complex closure without a complete
  coverage ledger and verification.
- Keep the debugging case must-pass. Clarify its binary rubric so rejecting an
  impossible premise and producing a source-compatible correction—or naming
  the exact missing evidence—is unambiguously gradable.
- Do not weaken, retire, expose, or rewrite the sealed holdouts.
