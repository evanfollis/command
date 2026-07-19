# Thread-opening release run e93463

Fresh no-cache resealed release run `run-20260719T211137Z-e93463` failed
closed. Both sealed holdouts passed with judge unknown ratio `0.0`; their
inputs, outputs, rubrics, judge text, and individual identities were not
inspected or copied here.

- Runtime receipt: `/opt/workspace/runtime/prompteval/command-2206ef/thread-opening-frame/runs/run-20260719T211137Z-e93463.json`
- Run SHA-256: `2c003da4f3326fc9a38fa6d3343d7b118147cbd23ee4b8863de721639092ef59`
- Run golden hash: `gh-21bbd857432b865f`
- Run prompt version: `pv-90dc0b442a057bc1`
- Sealed holdout SHA-256: `e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8`
- Sealed holdout count/passed: `2/2`
- Post-correction active-set SHA-256: `417b36516913ebf14a699bd01574cb16d90a4b19051947908ad22bc7e42d421a`

Two active contract defects were demonstrated. Targeted regeneration had
silently restored six probe-limited cases to required status; those exact IDs
are recorded in the bounded JSON receipt and are advisory again at their
generator source. Required aggregate for the immutable run was `0.6471`; with
the intended advisory classification, the same results contain 10 passes
among 11 required release cases (`0.9091`). Active production regression
`gc-45128a2d178513a7` also remained a genuine failure under
`irreversible-file-delete-treated-as-run-command`, so the frame now classifies
recoverability before applying its broad reversible-action default.
