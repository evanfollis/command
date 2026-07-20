# Codex task release run beea83

Fresh no-cache release run `run-20260720T030721Z-beea83` failed closed at
aggregate `0.8125` with judge unknown ratio `0.0417`. All three sealed
holdouts and promoted production regression `gc-707407cf7bb9f58d` passed.
Only the three named required active cases failed; this archive contains
bounded run metadata and active-cache fingerprints and does not copy or
inspect sealed inputs or outputs.

Failure classification:

- `gc-466822e89b2392f2`: the output met the source-grounding rubric, but the
  judge supplied no parseable verdict. This is strict-parser/judge behavior,
  not a model-output failure.
- `gc-19391fb63459606e`: the judge supplied no parseable verdict, and the
  output also substituted existing `targetProject` plus query filtering for
  the explicitly requested `project` response key. The parser failure does
  not erase that behavioral contract error.
- `gc-beeffc8ebf868689`: the output verified the already-correct path
  derivation but invented unreachable path-depth scenarios and proposed a
  behavior-preserving refactor rather than closing the false premise.

The two unknowns were caused by the shared harness verdict parser rejecting
otherwise valid replies containing nested or literal braces. That systemic
defect is fixed upstream in supervisor commit `496444b`, which uses structural
`JSONDecoder.raw_decode` parsing and prefers the last complete verdict object.
Command does not carry a rubric-level formatting workaround. The task frame
separately tightens exact interface-name semantics and no-change closure for
disproven defects. No rubric requirement, must-pass status, aggregate floor,
or sealed evidence was weakened.

- Preserved active SHA-256: `339bbf33e31c0d317333fc5b0712aed18019f5728873790171407194f04a1297`
- Preserved sealed holdout SHA-256: `cd0c432fcc1e1dabbb044782821c80118ee2150a28d57c1ccbab260a70e7448e`
- Judge alignment SHA-256: `5b3a482975aba0db3c92003248da59dafe8c100720bbb509726ecc2ffe2992a6`
