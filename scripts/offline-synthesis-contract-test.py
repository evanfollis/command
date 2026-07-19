#!/usr/bin/env python3
"""Regression for the evidence/rubric mismatch exposed by caf280."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / '.prompteval' / 'offline-synthesis-prompt'
GENERATOR = ROOT / 'scripts' / 'generate-golden-cases.py'
ARCHIVE = SPEC / 'archive' / 'active-contract-v1'
RUN = Path('/opt/workspace/runtime/prompteval/command-2206ef/offline-synthesis-prompt/runs/run-20260719T181501Z-caf280.json')
CACHE = Path('/opt/workspace/runtime/prompteval/command-2206ef/offline-synthesis-prompt/cache/ck-07d0912cf2acee17.json')
ARCHIVED_CASE_SHA = '92f536b04fb8da46cf4136bc323ee1ff8169136268c83481329b35c39b8b6e23'
RUN_SHA = '1761d5c9f80ea89da752163761ca23c76eadd4e47a34ee1be53787ee2096350e'
CACHE_SHA = '4509b3eb91e8e0e136cc10ad1f83df57d40e041d6639bee0371063cb0a8c9eae'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def baseline_hashes() -> dict[str, str]:
    return {
        str(path.relative_to(ROOT)): digest(path)
        for path in sorted((ROOT / '.prompteval').glob('*/baseline.json'))
    }


archived_path = ARCHIVE / 'gc-3b64928414ae568a.jsonl'
assert digest(archived_path) == ARCHIVED_CASE_SHA
archived = load_jsonl(archived_path)
assert len(archived) == 1
old_case = archived[0]
assert old_case['id'] == 'gc-3b64928414ae568a'
old_rubric = next(check['rubric'] for check in old_case['checks'] if check['kind'] == 'judge')
assert 'reverse proxy are the root class' in old_rubric
assert len(old_case['input']['patterns'][0]['evidence']) == 2

receipt = json.loads((ARCHIVE / 'failed-run-receipt.json').read_text())
assert receipt['archived_case_sha256'] == ARCHIVED_CASE_SHA
assert receipt['run']['sha256'] == RUN_SHA
assert receipt['cache']['sha256'] == CACHE_SHA
if RUN.exists():
    assert digest(RUN) == RUN_SHA
    run = json.loads(RUN.read_text())
    assert run['release'] is True and run['cached_allowed'] is False
    assert run['gate']['passed'] is False
    assert list(case_id for case_id, result in run['cases'].items() if not result['pass']) == ['gc-3b64928414ae568a']
if CACHE.exists():
    assert digest(CACHE) == CACHE_SHA
    cached_output = json.loads(CACHE.read_text())['output']
    assert 'WebKit' in cached_output
    assert 'new Map<string, number>()' in cached_output
    assert "req.headers.get('user-agent')" in cached_output

active = load_jsonl(SPEC / 'golden' / 'cases.jsonl')
assert all(case['id'] != 'gc-3b64928414ae568a' for case in active)
corrected = [
    case for case in active
    if any(check.get('failure_mode') == 'unsupported-auth-causality' for check in case['checks'])
]
assert len(corrected) == 1
case = corrected[0]
evidence = case['input']['patterns'][0]['evidence']
assert any('No request URL' in item and 'cookie-return trace' in item for item in evidence)
assert any('COMMAND_ORIGIN' in item and 'no internal-host leak' in item for item in evidence)
rubric = next(check['rubric'] for check in case['checks'] if check.get('failure_mode') == 'unsupported-auth-causality')
assert 'without evidence that distinguishes it' in rubric
assert 'missing discriminating evidence' in rubric
assert 'reverse proxy are the root class' not in rubric

prompt = (ROOT / 'src' / 'prompts' / 'offline-synthesis-prompt.md').read_text()
assert 'test the server-generated URL hypothesis against the supplied evidence' in prompt
assert 'Do not force a reverse-proxy explanation from a generic authentication symptom' in prompt

# Regeneration must preserve the sealed holdout and every accepted/untracked
# baseline, and must be byte-idempotent for the corrected active contract.
holdout_path = SPEC / 'golden' / 'holdout.jsonl'
holdout_before = digest(holdout_path)
active_before = digest(SPEC / 'golden' / 'cases.jsonl')
baselines_before = baseline_hashes()
generated = subprocess.run(
    [sys.executable, str(GENERATOR), '--prompt-id', 'offline-synthesis-prompt'],
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=False,
)
assert generated.returncode == 0, generated.stderr
assert digest(holdout_path) == holdout_before, 'targeted generation changed sealed holdout bytes'
assert digest(SPEC / 'golden' / 'cases.jsonl') == active_before, 'corrected active contract is not byte-idempotent'
assert baseline_hashes() == baselines_before, 'targeted generation changed a baseline'

print('offline synthesis evidence contract, provenance, holdout, and baseline preservation tests passed')
