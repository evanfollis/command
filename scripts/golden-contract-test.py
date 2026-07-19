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
V2_FEEDBACK_RUN = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260719T183312Z-318ec6.json')
V2_FEEDBACK_RUN_SHA = '91eaf1a693171c4f42d8a7ef9d4fbb0e7875fec3f014ab51bbb47ddc279a6fc3'
V2_FEEDBACK_CACHES = {
    'gc-466822e89b2392f2': ('ck-8afb997fffdf4f0d.json', 'd3c77295d6f1d5835af64b8086055c66b3b409770645be8074b12d6dc7797612'),
    'gc-0208a8225000a225': ('ck-29cfd28dc657227b.json', '0b0f6b038ce76d325faff481c735afe8a92dcafe8577f1d055e40110c414724f'),
    'gc-dacb6094a0651bd4': ('ck-934d8d108dbb9821.json', '09c96bc3a71ff64682a282ec4d65b309d350469b065c9516cf8a0c40dc22430c'),
}
EEC522_RUN = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260719T195258Z-eec522.json')
EEC522_RUN_SHA = 'a48305c029c03b94dafea8d69a8fe69443050d16c0cf06a82bb671b3f0d4518d'
EEC522_ACTIVE_CACHES = {
    'gc-77322229d9ca8bd2': ('ck-71b4fae197945281.json', '3c447916d17688f0075b6973fed701ccfa48c1118aa0938af62b7b41423e1249'),
    'gc-dacb6094a0651bd4': ('ck-a39f70b86e604dfd.json', '562a983470d7fe28aa8d0056a0b87197d023fcd18e6a73b586d88f5e951b932f'),
}
PRODUCT_BOUNDARY_ARCHIVE = SPEC / 'archive' / 'v2-product-boundary-20260719'
RETIRED_ATTACH_SOURCE_SHA = '49850946fa91d63e868bf4e58585565ac6281b32ffbee4cabc6ffa374f3895a2'
RETIRED_ATTACH_CASES_SHA = '47fc8a7bef5b818bb6a64139f80e7c032db2d87fec6425a5c8d73abe0913e8b4'
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
assert not (ROOT / 'src' / 'lib' / 'attachLock.ts').exists(), 'retired eval subject leaked back into runtime source'
assert digest(PRODUCT_BOUNDARY_ARCHIVE / 'attachLock.ts') == RETIRED_ATTACH_SOURCE_SHA
assert digest(PRODUCT_BOUNDARY_ARCHIVE / 'retired-cases.jsonl') == RETIRED_ATTACH_CASES_SHA
retired_attach_cases = load_jsonl(PRODUCT_BOUNDARY_ARCHIVE / 'retired-cases.jsonl')
assert {case['input']['task_id'] for case in retired_attach_cases} == {'t-fix-03', 't-docs-07'}
assert all('attachLock.ts' in case['input']['description'] for case in retired_attach_cases)
boundary_manifest = json.loads((PRODUCT_BOUNDARY_ARCHIVE / 'manifest.json').read_text())
assert boundary_manifest['source']['sha256'] == RETIRED_ATTACH_SOURCE_SHA
assert boundary_manifest['retired_cases']['sha256'] == RETIRED_ATTACH_CASES_SHA
assert set(boundary_manifest['retired_cases']['ids']) == {case['id'] for case in retired_attach_cases}

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

feedback_receipt = json.loads((SPEC / 'archive' / 'v2-run-318ec6' / 'failed-run-receipt.json').read_text())
assert feedback_receipt['sha256'] == V2_FEEDBACK_RUN_SHA
assert feedback_receipt['active_failed'] == [
    'gc-466822e89b2392f2',
    'gc-0208a8225000a225',
    'gc-dacb6094a0651bd4',
]
assert feedback_receipt['sealed_holdouts_passed'] == 3
if V2_FEEDBACK_RUN.exists():
    assert digest(V2_FEEDBACK_RUN) == V2_FEEDBACK_RUN_SHA
    feedback_run = json.loads(V2_FEEDBACK_RUN.read_text())
    assert feedback_run['release'] is True and feedback_run['cached_allowed'] is False
    assert feedback_run['gate']['passed'] is False

cache_root = V2_FEEDBACK_RUN.parent.parent / 'cache'
for case_id, (name, expected_sha) in V2_FEEDBACK_CACHES.items():
    path = cache_root / name
    if path.exists():
        assert digest(path) == expected_sha, f'feedback cache drifted: {case_id}'
doc_output = json.loads((cache_root / V2_FEEDBACK_CACHES['gc-0208a8225000a225'][0]).read_text())['output']
assert 'Prompteval remains fail-closed' in doc_output
assert 'prompt eval governance implemented for all four command prompts' in doc_output.lower()
complex_output = json.loads((cache_root / V2_FEEDBACK_CACHES['gc-dacb6094a0651bd4'][0]).read_text())['output']
assert 'metadata: {' in complex_output and 'reviewArtifacts' in complex_output
assert '<AuditTrail taskId={task.id} />' in complex_output

eec522_receipt = json.loads((SPEC / 'archive' / 'run-20260719T195258Z-eec522' / 'failed-run-receipt.json').read_text())
assert eec522_receipt['sha256'] == EEC522_RUN_SHA
assert eec522_receipt['active_failed'] == {
    'gc-77322229d9ca8bd2': 'goal-not-addressed',
    'gc-dacb6094a0651bd4': 'cross-file-artifact-incoherent',
}
assert eec522_receipt['sealed_unknown']['classification'] == 'judge_unknown_unparseable'
assert eec522_receipt['sealed_unknown']['behavioral_evidence'] is False
if EEC522_RUN.exists():
    assert digest(EEC522_RUN) == EEC522_RUN_SHA
for case_id, (name, expected_sha) in EEC522_ACTIVE_CACHES.items():
    path = cache_root / name
    if path.exists():
        assert digest(path) == expected_sha, f'eec522 active cache drifted: {case_id}'

alignment = load_jsonl(SPEC / 'judge' / 'alignment.jsonl')
source_alignment = [item for item in alignment if item['failure_mode'] == 'debugging-without-source-grounding']
assert len(source_alignment) == 1
assert source_alignment[0]['human_verdict'] == 'pass'
assert 'genuine empty array' in source_alignment[0]['output']

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
assert not ({case['id'] for case in active} & {case['id'] for case in retired_attach_cases})
assert all('attachLock.ts' not in case['input']['description'] for case in active)
assert set(boundary_manifest['replacement_active_case_ids']) <= {case['id'] for case in active}
assert boundary_manifest['sealed_holdout_sha256'] == digest(SPEC / 'golden' / 'holdout.jsonl')

fixed_case = next(case for case in active if case['input']['task_id'] == 't-fix-03')
fixed_rubric = next(check['rubric'] for check in fixed_case['checks'] if check.get('failure_mode') == 'already-fixed-state-missed')
assert 'src/lib/observatory.ts' in fixed_rubric
assert 'basename(dirname(path))' in fixed_rubric

small_edit_case = next(case for case in active if case['input']['task_id'] == 't-docs-07')
small_edit_rubric = next(check['rubric'] for check in small_edit_case['checks'] if check.get('failure_mode') == 'exact-small-edit-missing')
assert 'src/middleware.ts' in small_edit_rubric
assert 'PUBLIC_PATHS' in small_edit_rubric

smoke_case = next(case for case in active if case['input']['task_id'] == 't-smoke-04')
goal_rubric = next(check['rubric'] for check in smoke_case['checks'] if check.get('failure_mode') == 'goal-not-addressed')
assert 'probe lacks execution authority' in goal_rubric
assert 'exact command and working directory' in goal_rubric
assert 'do not require execution that the probe contract forbids' in goal_rubric

prompt_source = (ROOT / 'src' / 'prompts' / 'codex-task-prompt.md').read_text()
for required in ('write ordering', 'partial-failure recovery', 'idempotent replay or backfill',
                 'authoritative producer ownership', 'acknowledged atomicity gaps'):
    assert required in prompt_source, f'missing coupled-store durability contract: {required}'

debug_case = next(case for case in active if case['id'] == 'gc-466822e89b2392f2')
debug_rubric = next(check['rubric'] for check in debug_case['checks'] if check.get('failure_mode') == 'debugging-without-source-grounding')
assert debug_case['must_pass'] is True
assert 'explicitly determines whether a genuine empty array can cause the TypeError' in debug_rubric
assert 'Do not require a patch for an impossible premise' in debug_rubric

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
assert 'sealed holdout untouched' in targeted_result.stdout
assert snapshot_eval_files() == before, 'targeted regeneration was non-idempotent or crossed prompt boundaries'

print('codex-task-prompt v2 contract, archive provenance, and generator safety tests passed')
