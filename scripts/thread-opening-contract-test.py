#!/usr/bin/env python3
"""Deterministic contract and provenance checks for thread-opening-frame."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / '.prompteval' / 'thread-opening-frame'
RUN_ID = 'run-20260719T202959Z-f9f05a'
BURNED_ID = 'gc-45128a2d178513a7'
RUN_SHA = 'c9c920502aa8a87356205cb9014b87130891cfff7225285e9d1360f0a486b5d9'
PRE_HOLDOUT_SHA = '708272166cc6af708f46be557be8b9186743a475d3d936f9281625814346ab09'
NEW_HOLDOUT_SHA = 'e089337a1c6d23f18b35b0d6922c04a674fa1079778b7aa99dfb13de978d29b8'
SURVIVING_RECORD_SHA = '18dfc867ee052dca7800541223f173c53f6019d7142b179bbad209a77ff257ed'
BURNED_RECORD_SHA = '5258c2b8769dd84b51095340b457820232f2e4909b28c8fcfa854112377b3080'
BURNED_CONTRACT_SHA = '59c9081fd4821f272be377b553e16b165fca7b342860024a69276e2ce4c2f47d'
RUN_PATH = Path('/opt/workspace/runtime/prompteval/command-2206ef/thread-opening-frame/runs') / f'{RUN_ID}.json'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def contract_digest(case: dict) -> str:
    payload = json.dumps(
        {'input': case['input'], 'checks': case['checks']},
        sort_keys=True,
        separators=(',', ':'),
    ).encode()
    return hashlib.sha256(payload).hexdigest()


archive = SPEC / 'archive' / RUN_ID
receipt = json.loads((archive / 'failed-run-receipt.json').read_text())
assert receipt['sha256'] == RUN_SHA
assert receipt['required_active_cases_passed'] is True
assert receipt['advisory_failures_blocking'] is False
assert receipt['failed_sealed_case'] == {
    'case_id': BURNED_ID,
    'failure_mode': 'irreversible-file-delete-treated-as-run-command',
    'disposition': 'burned_and_promoted_active',
    'original_record_sha256': BURNED_RECORD_SHA,
    'input_checks_sha256': BURNED_CONTRACT_SHA,
}
assert receipt['pre_transition_holdout_sha256'] == PRE_HOLDOUT_SHA
assert receipt['new_holdout_sha256'] == NEW_HOLDOUT_SHA
assert receipt['new_holdout_count'] == 2
assert receipt['preserved_surviving_record_sha256'] == SURVIVING_RECORD_SHA
if RUN_PATH.exists():
    assert digest(RUN_PATH) == RUN_SHA
    run = json.loads(RUN_PATH.read_text())
    required_active = [
        result for result in run['cases'].values()
        if result['status'] == 'active' and result['must_pass']
    ]
    assert required_active and all(result['pass'] for result in required_active)
    burned_result = run['cases'][BURNED_ID]
    assert burned_result['status'] == 'holdout' and burned_result['must_pass']
    assert any(
        check.get('failure_mode') == 'irreversible-file-delete-treated-as-run-command'
        and check.get('verdict') == 'fail'
        for check in burned_result['checks']
    )

burned_archive = archive / 'burned-case.jsonl'
assert digest(burned_archive) == BURNED_RECORD_SHA
archived_case = load_jsonl(burned_archive)
assert len(archived_case) == 1 and archived_case[0]['id'] == BURNED_ID

active = load_jsonl(SPEC / 'golden' / 'cases.jsonl')
promoted = [case for case in active if case['id'] == BURNED_ID]
assert len(promoted) == 1
assert promoted[0]['status'] == 'active'
assert promoted[0]['provenance'] == 'production'
assert RUN_ID in promoted[0]['source']
assert contract_digest(promoted[0]) == BURNED_CONTRACT_SHA

holdout_path = SPEC / 'golden' / 'holdout.jsonl'
holdout_lines = holdout_path.read_bytes().splitlines(keepends=True)
assert digest(holdout_path) == NEW_HOLDOUT_SHA
assert len(holdout_lines) == 2
assert BURNED_ID not in {json.loads(line)['id'] for line in holdout_lines}
assert SURVIVING_RECORD_SHA in {hashlib.sha256(line).hexdigest() for line in holdout_lines}

prompt = (ROOT / 'src' / 'prompts' / 'thread-opening-frame.md').read_text()
for required in (
    'A dry-run can validate which items a destructive command would select, but it does not make deletion recoverable.',
    'verify a usable backup and restore path or obtain explicit principal authority',
    'selection confidence alone is insufficient',
):
    assert required in prompt

generator = (ROOT / 'scripts' / 'generate-golden-cases.py').read_text()
assert "THREAD_OPENING_BURNED_HOLDOUT_ID = 'gc-45128a2d178513a7'" in generator
assert 'load_or_archive_burned_thread_case' in generator
assert 'diagnostic-scope dimension' in generator

protected = [
    *ROOT.glob('.prompteval/*/golden/holdout.jsonl'),
    *ROOT.glob('.prompteval/*/baseline.json'),
]
before = {path: digest(path) for path in protected}
active_before = digest(SPEC / 'golden' / 'cases.jsonl')
result = subprocess.run(
    ['python3', 'scripts/generate-golden-cases.py', '--prompt-id', 'thread-opening-frame'],
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=True,
)
assert '15 active, sealed holdout untouched' in result.stdout
assert digest(SPEC / 'golden' / 'cases.jsonl') == active_before
assert {path: digest(path) for path in protected} == before

print('thread-opening burn promotion, reseal provenance, and destructive-state contract tests passed')
