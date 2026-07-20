# Codex task release run 0fdda5

Fresh no-cache release run `run-20260720T053721Z-0fdda5` failed closed at
aggregate `0.6875` with judge unknown ratio `0.0833`.

- Runtime report: `/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T053721Z-0fdda5.json`
- Runtime report SHA-256: `ce4189915f244b7d18d1882dde6e2cc3a918fa2196db17c2bb8f36a9db71a013`
- Sole substantive model-output failure: `gc-0208a8225000a225`
- Evaluator-format failures: `gc-19391fb63459606e`, `gc-cb721b1a677003af`, `gc-707407cf7bb9f58d`, and `gc-c0ce7b888fbf96be`
- Shared evaluator correction: supervisor commit `d1005d4`

The substantive output trusted status prose and inventory without validating
the underlying baseline artifacts. The other four required failures came from
successful judge calls that returned no verdict parseable by the evaluator.

Provider provenance is retained as bounded metadata only: the run requested
Claude Sonnet for execution and Opus for judging, used Claude and Codex routes,
recorded 160 successful calls and 16 fallback successes, and recorded one
unavailable Claude executor attempt. No private transcript content is copied
into this archive.

Root review inspected sealed holdout `gc-c0ce7b888fbf96be` after the failed run,
so it is burned. Its exact original JSONL line is preserved as
`burned-case.jsonl`; the current sealed set replaces it with a freshly minted
case in the same broad release-dependency-state epistemic dimension, using
materially different facts and wording. Gates and rubrics remain strict.
