# Codex task release run 5a9247

Fresh no-cache release run `run-20260720T000322Z-5a9247` failed closed at
aggregate `0.7333` with judge unknown ratio `0.0`. This archive records
bounded run metadata and opaque sealed-record fingerprints only. The failed
sealed input, output, rubric, and judge text were not inspected before burn.

- Runtime receipt: `/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T000322Z-5a9247.json`
- Run SHA-256: `ea14d03aab2e7700a041717555ebb902b119db3c609be2a878d6c374a053c151`
- Pre-transition holdout SHA-256: `e7ad1dd7c30f879bf2135be5252fadf2132aba165f06cbd18a5d57b570fb091b`
- Failed sealed ID: `gc-707407cf7bb9f58d`
- Failed sealed record SHA-256: `1f5286f94fe279ded7347067c86d52719e4ba618a80b82a8037660f57020647b`
- Failed sealed input/check fingerprint: `f42a1dd70d8818ce0b3cab87fe0974830ab920b18fb8e34736db0ad14d9d05f0`
- Preserved passing record SHA-256: `a45eec707e38d78604103ca5fc5be07c8b40cef45694917d7e346d080217d6a0`
- Preserved passing record SHA-256: `c063271fb07943fd65df878811accfd209baa6d3d339076b28f23999a2668ba6`
- Post-transition active SHA-256: `339bbf33e31c0d317333fc5b0712aed18019f5728873790171407194f04a1297`
- Post-transition sealed SHA-256: `cd0c432fcc1e1dabbb044782821c80118ee2150a28d57c1ccbab260a70e7448e`
- Opaque replacement record SHA-256: `943aacda181e423713894fe9762785f2a4644720cc33f38da62dfc23cec75e69`

The failed sealed case is burned evidence. The targeted transition archives
its exact original line, promotes its unchanged input/check contract into the
required active set with production provenance, preserves both passing sealed
records byte-for-byte, and adds one newly minted sealed replacement from a
different release-dependency behavior dimension. Diagnosis begins only after
that transition completes.

After promotion, bounded inspection showed three related measurement failures:
the Codex wrapper advertised Claude-only read tools, unavailable operations
could terminate at a generic capability statement instead of a complete safe
handoff, and release diagnosis did not require grounding in runtime/readiness
configuration. The correction is in the wrapper and governed prompt; no judge,
required threshold, or sealed passing evidence was weakened.
