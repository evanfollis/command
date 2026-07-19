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
STALE_SUCCESS_RUN_ID = 'run-20260719T232005Z-65757a'
STALE_SUCCESS_RUN = Path('/opt/workspace/runtime/prompteval/command-2206ef/offline-synthesis-prompt/runs') / f'{STALE_SUCCESS_RUN_ID}.json'
STALE_SUCCESS_RUN_SHA = 'b5b51acab5ecd6e45d82001cf9fed2192a88a408b5207f2ae6d6f05949812d7c'
STALE_SUCCESS_CACHE = Path('/opt/workspace/runtime/prompteval/command-2206ef/offline-synthesis-prompt/cache/ck-19eb7841d2d89a9f.json')
STALE_SUCCESS_CACHE_SHA = '38499475993bcb5ec0045b960ac54c5f352952c4778080dcdfb5b0d08af79ec8'
STALE_SUCCESS_CASE_SHA = '60fa5e9860de0dcfa0302f607980580ab11c06f5ed607202a28e87ce95d3f692'


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

stale_archive = SPEC / 'archive' / STALE_SUCCESS_RUN_ID
stale_receipt = json.loads((stale_archive / 'failed-run-receipt.json').read_text())
assert stale_receipt['sha256'] == STALE_SUCCESS_RUN_SHA
assert stale_receipt['active_cache']['sha256'] == STALE_SUCCESS_CACHE_SHA
assert stale_receipt['retired_active_record_sha256'] == STALE_SUCCESS_CASE_SHA
assert stale_receipt['replacement_active_case_id'] == 'gc-04a60cb9b6eb809c'
assert stale_receipt['causal_defect'] == 'stateful_synthetic_success_contradicted_current_workspace'
assert stale_receipt['sealed_holdouts'] == {'count': 2, 'passed': 2, 'content_inspected': False}
retired_success_path = stale_archive / 'retired-active-case.jsonl'
assert digest(retired_success_path) == STALE_SUCCESS_CASE_SHA
retired_success = load_jsonl(retired_success_path)
assert len(retired_success) == 1 and retired_success[0]['id'] == 'gc-863e35027ce505e8'
if STALE_SUCCESS_RUN.exists():
    assert digest(STALE_SUCCESS_RUN) == STALE_SUCCESS_RUN_SHA
    stale_run = json.loads(STALE_SUCCESS_RUN.read_text())
    required_failures = [
        case_id for case_id, result in stale_run['cases'].items()
        if result['must_pass'] and not result['pass']
    ]
    sealed_results = [
        result for result in stale_run['cases'].values() if result['status'] == 'holdout'
    ]
    assert required_failures == ['gc-863e35027ce505e8']
    assert len(sealed_results) == 2 and all(result['pass'] for result in sealed_results)
    assert stale_run['judge_unknown_ratio'] == 0.0
if STALE_SUCCESS_CACHE.exists():
    assert digest(STALE_SUCCESS_CACHE) == STALE_SUCCESS_CACHE_SHA
    stale_output = json.loads(STALE_SUCCESS_CACHE.read_text())['output']
    assert 'success claim is not confirmed by the current workspace state' in stale_output
    assert 'contains no nonzero exit path' in stale_output

active = load_jsonl(SPEC / 'golden' / 'cases.jsonl')
assert all(case['id'] != 'gc-863e35027ce505e8' for case in active)
verified_success = [
    case for case in active
    if any(check.get('failure_mode') == 'preserve-success' for check in case['checks'])
]
assert len(verified_success) == 1
verified_success = verified_success[0]
assert verified_success['id'] == 'gc-04a60cb9b6eb809c'
assert verified_success['must_pass'] is True
pattern = verified_success['input']['patterns'][0]
assert pattern['project'] == 'command' and pattern['category'] == 'success'
assert pattern['summary'] == 'Release preflight gates on prompt/spec/golden drift before staging'
assert any('release.sh invokes the shared preflight' in evidence for evidence in pattern['evidence'])
assert any('prompteval check fail-closed' in evidence for evidence in pattern['evidence'])
old_preserve_rubric = next(
    check['rubric'] for check in retired_success[0]['checks']
    if check.get('failure_mode') == 'preserve-success'
)
new_preserve_rubric = next(
    check['rubric'] for check in verified_success['checks']
    if check.get('failure_mode') == 'preserve-success'
)
assert new_preserve_rubric == old_preserve_rubric

release_source = (ROOT / 'scripts' / 'release.sh').read_text()
preflight_source = Path('/opt/workspace/supervisor/scripts/lib/preflight-deploy.sh').read_text()
assert release_source.index('/opt/workspace/supervisor/scripts/lib/preflight-deploy.sh') < release_source.index('git worktree add --detach')
assert '/opt/workspace/supervisor/scripts/prompteval check .' in preflight_source

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
