# Codex task prompt golden contract v1 (retired)

Contract v1 is preserved byte-for-byte from committed `HEAD` `74c6ca8`, the
canonical sealed input consumed by release run
`run-20260719T174001Z-41af82`. It is retired because every case required the
model response to echo `Task ID:`, `Working directory:`, and `Intent:` from the
rendered dispatch prompt. Those checks measured parroting rather than task
comprehension or closure.

Canonical SHA-256 digests:

- `cases.jsonl`: `1137b119fa29a13cc22063132dee2fd1c3ef22db29987b5798681ff37eab7b1a`
- `holdout.jsonl`: `a067053a0e0a67a355d891c13162697fbd764b332abdf945040f550cde68502b`

Failed release receipt:

- Runtime path: `/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260719T174001Z-41af82.json`
- Receipt SHA-256: `4e9e820efb586def155d6dca887ac0315095d8fdc01f5343417f0a6cc42d874e`
- Golden hash: `gh-4c09f6571a629dc5`
- Prompt version: `pv-6ce30f7ee75fbd87`
- Result: 1 of 14 cases passed; 11 must-pass cases failed. Required metadata
  checks short-circuited the behavioral judge on the failures.

The current cache corroborates the category error rather than a dispatch-prompt
failure. Representative immutable cache receipts include:

- `ck-44d59c6133eb90e2.json` (`sha256:a634e2ee5cc229414e4f36e16d66a73e7dbffbf94f041329d0114ee94812a6c7`):
  inspected current `metaLearning.ts`, reconciled the stale line reference, and
  returned an exact proposed diff.
- `ck-e4a1a3e41b8678e6.json` (`sha256:af845a470c847f6731237bb1c41bc27217ddca65f72856e2639f5685466955b3`):
  truthfully declined to fabricate smoke output and returned the exact command.
- `ck-2861743bcd45e920.json` (`sha256:5b0ea1d43c88417ad8582b989f1d2acb638786f6be33bd95242b8f2bf290be84`):
  identified the ambiguous request and asked for bounded missing evidence.
- `ck-5307a13264a75077.json` (`sha256:2b4aa5b7ca94949f15aeafe140df6c38781276269e0b2140739d5ba403216456`):
  found the requested stale-socket guard already present instead of proposing a
  redundant change. This was the sole response that happened to echo all three
  metadata labels and therefore the sole v1 pass.

After that run, invoking the old generator with `--help` accidentally rewrote
all four prompt sets because it ignored arguments and executed eagerly. Those
files were not run inputs. The accidental Codex digests were
`ed06069e6cc9fc76459c27f52099d2dd01a7aec93d231a01ff7b95f74d7d8239`
(active) and
`9bd99a8a45f251159bddc87199496be20443d7e79d351dd2fd9b0f9e6aa51e21`
(holdout); unrelated generated changes were restored from `HEAD`. The accepted
`review-prompt/baseline.json` update was preserved.

The v1 files remain immutable evidence. Their `active` and `holdout` fields are
historical facts; retirement is represented by this archive boundary, not by
rewriting their bytes.
