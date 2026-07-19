#!/usr/bin/env python3
"""Deterministic regressions for Codex task golden-contract v2 and generator safety."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / '.prompteval' / 'codex-task-prompt'
GENERATOR = ROOT / 'scripts' / 'generate-golden-cases.py'
RUNTIME_RECEIPT = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260719T174001Z-41af82.json')
V1_ACTIVE_SHA = '1137b119fa29a13cc22063132dee2fd1c3ef22db29987b5798681ff37eab7b1a'
V1_HOLDOUT_SHA = 'a067053a0e0a67a355d891c13162697fbd764b332abdf945040f550cde68502b'
FAILED_RUN_SHA = '4e9e820efb586def155d6dca887ac0315095d8fdc01f5343417f0a6cc42d874e'
FORBIDDEN_ECHOES = {'Task ID:', 'Working directory:', 'Intent:'}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def snapshot_eval_files() -> dict[str, str]:
    return {
        str(path.relative_to(ROOT)): digest(path)
        for path in sorted((ROOT / '.prompteval').rglob('*'))
        if path.is_file()
    }


def run_generator(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GENERATOR), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


v1_active_path = SPEC / 'archive' / 'v1' / 'cases.jsonl'
v1_holdout_path = SPEC / 'archive' / 'v1' / 'holdout.jsonl'
assert digest(v1_active_path) == V1_ACTIVE_SHA
assert digest(v1_holdout_path) == V1_HOLDOUT_SHA

receipt = json.loads((SPEC / 'archive' / 'v1' / 'failed-run-receipt.json').read_text())
assert receipt['status'] == 'retired'
assert receipt['active_sha256'] == V1_ACTIVE_SHA
assert receipt['holdout_sha256'] == V1_HOLDOUT_SHA
assert receipt['failed_run']['failed_cases'] == 13
assert receipt['failed_run']['passed_cases'] == 1
if RUNTIME_RECEIPT.exists():
    assert digest(RUNTIME_RECEIPT) == FAILED_RUN_SHA
    runtime = json.loads(RUNTIME_RECEIPT.read_text())
    assert runtime['gate']['passed'] is False
    assert runtime['golden_hash'] == receipt['failed_run']['golden_hash']
    assert sum(not result['pass'] for result in runtime['cases'].values()) == 13

v1_cases = load_jsonl(v1_active_path) + load_jsonl(v1_holdout_path)
assert len(v1_cases) == 14
for case in v1_cases:
    required = {check.get('value') for check in case['checks'] if check['kind'] == 'contains'}
    assert FORBIDDEN_ECHOES <= required, f"v1 evidence no longer demonstrates echo contamination: {case['id']}"

active = load_jsonl(SPEC / 'golden' / 'cases.jsonl')
holdout = load_jsonl(SPEC / 'golden' / 'holdout.jsonl')
assert len(active) == 12
assert 2 <= len(holdout) <= 4
assert not ({case['id'] for case in active} & {case['id'] for case in holdout})
assert not ({case['id'] for case in holdout} & {case['id'] for case in v1_cases}), 'v2 holdouts must be freshly minted'

for case in [*active, *holdout]:
    assert case['must_pass'] is True, f"behavioral edge silently made advisory: {case['id']}"
    assert case['checks'][0]['kind'] == 'length_band'
    judges = [check for check in case['checks'] if check['kind'] == 'judge']
    assert len(judges) >= 3
    assert len({check['failure_mode'] for check in judges}) == len(judges)
    for check in case['checks']:
        assert not (check['kind'] == 'contains' and check.get('value') in FORBIDDEN_ECHOES)
    description = case['input']['description']
    for judge in judges:
        assert judge['rubric'] != description, 'expected answer leaked into the dispatch input'

# --help and invalid invocation must be read-only. This directly regresses the
# 2026-07-19 incident where `--help` regenerated every prompt set.
before = snapshot_eval_files()
help_result = run_generator('--help')
assert help_result.returncode == 0
assert 'usage:' in help_result.stdout
assert snapshot_eval_files() == before, '--help mutated prompt-eval evidence'

invalid_result = run_generator()
assert invalid_result.returncode != 0
assert snapshot_eval_files() == before, 'missing target mutated prompt-eval evidence'

# Targeted generation must be byte-idempotent and must not touch any other
# prompt, baseline, archive, or sealed evidence.
targeted_result = run_generator('--prompt-id', 'codex-task-prompt')
assert targeted_result.returncode == 0, targeted_result.stderr
assert 'Wrote: codex-task-prompt' in targeted_result.stdout
assert snapshot_eval_files() == before, 'targeted regeneration was non-idempotent or crossed prompt boundaries'

print('codex-task-prompt v2 contract, archive provenance, and generator safety tests passed')
