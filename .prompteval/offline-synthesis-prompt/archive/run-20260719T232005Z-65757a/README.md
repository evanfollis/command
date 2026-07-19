# Offline synthesis release run 65757a

Fresh no-cache release run `run-20260719T232005Z-65757a` failed closed at
required aggregate `0.9286`. Both sealed holdouts passed and judge unknown
ratio was `0.0`; sealed inputs, outputs, rubrics, and identities were not
inspected or copied.

- Runtime receipt: `/opt/workspace/runtime/prompteval/command-2206ef/offline-synthesis-prompt/runs/run-20260719T232005Z-65757a.json`
- Run SHA-256: `b5b51acab5ecd6e45d82001cf9fed2192a88a408b5207f2ae6d6f05949812d7c`
- Fresh active cache: `ck-19eb7841d2d89a9f.json`
- Cache SHA-256: `38499475993bcb5ec0045b960ac54c5f352952c4778080dcdfb5b0d08af79ec8`
- Failed required active case: `gc-863e35027ce505e8`
- Failure mode: `preserve-success`
- Retired active-record SHA-256: `60fa5e9860de0dcfa0302f607980580ab11c06f5ed607202a28e87ce95d3f692`
- Replacement active case: `gc-04a60cb9b6eb809c`

The response used the read-capable probe to inspect Atlas and correctly found
that the synthetic claim “exit code fix landed” contradicted current source
and history. The judge then required preservation of that stale success. This
is a stateful active-evidence defect, not a prompt or model defect. The active
case is replaced at generator source with a currently verified Command success:
the release script invokes shared preflight before staging, and shared preflight
runs the prompt drift gate fail-closed. The required preserve-success rubric and
threshold are unchanged.
