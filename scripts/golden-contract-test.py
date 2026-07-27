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
RUN_5A9247 = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T000322Z-5a9247.json')
RUN_5A9247_SHA = 'ea14d03aab2e7700a041717555ebb902b119db3c609be2a878d6c374a053c151'
RUN_5A9247_ACTIVE_FAILURES = {
    'gc-19391fb63459606e',
    'gc-77322229d9ca8bd2',
    'gc-0208a8225000a225',
}
RUN_5A9247_BURNED_ID = 'gc-707407cf7bb9f58d'
RUN_5A9247_BURNED_SHA = '1f5286f94fe279ded7347067c86d52719e4ba618a80b82a8037660f57020647b'
RUN_5A9247_BURNED_CONTRACT_SHA = 'f42a1dd70d8818ce0b3cab87fe0974830ab920b18fb8e34736db0ad14d9d05f0'
RUN_5A9247_PRE_HOLDOUT_SHA = 'e7ad1dd7c30f879bf2135be5252fadf2132aba165f06cbd18a5d57b570fb091b'
RUN_5A9247_POST_ACTIVE_SHA = '339bbf33e31c0d317333fc5b0712aed18019f5728873790171407194f04a1297'
RUN_5A9247_POST_HOLDOUT_SHA = 'cd0c432fcc1e1dabbb044782821c80118ee2150a28d57c1ccbab260a70e7448e'
RUN_5A9247_PRESERVED_RECORD_SHAS = {
    'a45eec707e38d78604103ca5fc5be07c8b40cef45694917d7e346d080217d6a0',
    'c063271fb07943fd65df878811accfd209baa6d3d339076b28f23999a2668ba6',
}
RUN_5A9247_REPLACEMENT_SHA = '943aacda181e423713894fe9762785f2a4644720cc33f38da62dfc23cec75e69'
RUN_0FDDA5 = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T053721Z-0fdda5.json')
RUN_0FDDA5_SHA = 'ce4189915f244b7d18d1882dde6e2cc3a918fa2196db17c2bb8f36a9db71a013'
RUN_0FDDA5_BURNED_ID = 'gc-c0ce7b888fbf96be'
RUN_0FDDA5_BURNED_SHA = '943aacda181e423713894fe9762785f2a4644720cc33f38da62dfc23cec75e69'
RUN_0FDDA5_REPLACEMENT_ID = 'gc-bec2868c2f4daf0c'
RUN_0FDDA5_REPLACEMENT_SHA = '421637eac6fe0f984a9d5c6f4d4f9c468573b2858b63b99b329669df269ce963'
RUN_0FDDA5_FINAL_REPLACEMENT_ID = 'gc-94de61c46b321c2d'
RUN_0FDDA5_FINAL_REPLACEMENT_SHA = '61f4340999ce22799369deb950212468b9b14547797cef75586d8d16b7b21b41'
RUN_0FDDA5_POST_HOLDOUT_SHA = 'b864c016e14b54cabf8c26bc44060d360fb50ee08e4aff872e501a4e731ac678'
RUN_0FDDA5_FORMAT_FAILURES = {
    'gc-19391fb63459606e',
    'gc-cb721b1a677003af',
    'gc-707407cf7bb9f58d',
    RUN_0FDDA5_BURNED_ID,
}
RUN_5A9247_CACHES = {
    'gc-19391fb63459606e': ('ck-0b24c58618008842.json', 'ef0edee55c987e21aa807629b0948d60257751a11746e9426ac8df9800fdcd6a'),
    'gc-77322229d9ca8bd2': ('ck-90c81ae4e6e32a13.json', '1bc254abfb4a556334c3d161b808d31810ac5468ca0badeb4424af43e50bc9ed'),
    'gc-0208a8225000a225': ('ck-4d7dbea3ea7e8531.json', '53cf83b3ca22ddf89343b9afb281990027965647fb973a396beec85c5cf593db'),
    RUN_5A9247_BURNED_ID: ('ck-bde1eb693824ee96.json', '0e0690f67d27d557e2e436d83993e7ca7abdd163645202d7c6d749daabc5efd9'),
}
RUN_BEEA83 = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T030721Z-beea83.json')
RUN_BEEA83_SHA = 'eb782a6bde9f77003e409b43408af35d35e3a3fc171a260e30c8bb21a9759133'
RUN_BEEA83_FAILURES = {'gc-466822e89b2392f2', 'gc-19391fb63459606e', 'gc-beeffc8ebf868689'}
RUN_BEEA83_CACHES = {
    'gc-466822e89b2392f2': ('ck-080b3aad95dc4f00.json', '5d387fdc47ddd2610e0f6216127168616d5d2237f3cb6072b3eb1efb263ada86'),
    'gc-19391fb63459606e': ('ck-0090494db55795dc.json', '4dd4417dcffb941c9d1c3ac4b58df00aa9182ec7d7f4a858f58f36a54d513ad4'),
    'gc-beeffc8ebf868689': ('ck-363881f8939be229.json', '01257144d72f2496539e312a65b85cca135986d41d9186f475d85a56314a8ec8'),
}
RUN_BEEA83_PRESERVED_ACTIVE_SHA = '339bbf33e31c0d317333fc5b0712aed18019f5728873790171407194f04a1297'
RUN_BEEA83_ALIGNMENT_SHA = '5b3a482975aba0db3c92003248da59dafe8c100720bbb509726ecc2ffe2992a6'
RUN_452D63 = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T035742Z-452d63.json')
RUN_452D63_SHA = '9ea96a458d9a519d9a3bd1cc14765cafb0231f52e9c827ffedca5b8554518750'
RUN_452D63_CACHE = ('ck-08b6fc1898238779.json', '58761fa027d370fb1d6709a8f2e2f3eea8e60d7a8c49588acd144961e3925c7c')
RUN_ACD532 = Path('/opt/workspace/runtime/prompteval/command-2206ef/codex-task-prompt/runs/run-20260720T043613Z-acd532.json')
RUN_ACD532_SHA = 'f1e0976e88ac8775cc16fcd74c08fcb66f65f59fb2440279e5c154bdcad7ef39'
RUN_ACD532_CACHE = ('ck-6c7b9ce64b99c21c.json', 'eb4a163db16486ff4925573b5cc90beb3df3caad64d03c73e05df6afd9c1d1c2')
RUN_3D168B = 'run-20260720T071114Z-3d168b'
RUN_3D168B_SHA = '9e8177d79b7fa1b8f10989fe6afe2f33019d93e8686a4adf690d8135d7ec5939'
CONTAMINATED_HOLDOUT_SHA = 'b864c016e14b54cabf8c26bc44060d360fb50ee08e4aff872e501a4e731ac678'
CONTAMINATED_HOLDOUT_RECORDS = {
    'gc-466526ab26adb85b': 'c063271fb07943fd65df878811accfd209baa6d3d339076b28f23999a2668ba6',
    'gc-38b3e75ad2a0ab4d': 'a45eec707e38d78604103ca5fc5be07c8b40cef45694917d7e346d080217d6a0',
    'gc-94de61c46b321c2d': '61f4340999ce22799369deb950212468b9b14547797cef75586d8d16b7b21b41',
}
ADR0050_REPLACEMENT_HOLDOUT_SHA = '4fc87e7e2a846ce0041d3e656aaa09be4c8b5dbe6acd233711c38c95f9f673bb'
ADR0050_REPLACEMENT_HOLDOUT_RECORDS = {
    'gc-51913b36c1570860': '6cf1bd39dcf07dbf5ce4ecf28dc60602a5f6632e6e09434790a280e443c48453',
    'gc-15d1a422f6b33458': '5bb52e7561c3b32d73650c5aa33ab03f24ee0f906391310b3d20da26aff003ff',
    'gc-f4a583ea1d73f274': 'bd35acc49fde519f802b4d9e4c19f31fc630351529a89479eb263ca52d5efd39',
}
FAILED_REPLACEMENT_POOL_SHA = '029a6b182c2edfe6d45b2529850a8e083270c695f8ce55bc015ee8f6f150550d'
FAILED_REPLACEMENT_POOL_RECORDS = {
    'gc-51913b36c1570860': '6cf1bd39dcf07dbf5ce4ecf28dc60602a5f6632e6e09434790a280e443c48453',
    'gc-15d1a422f6b33458': '5bb52e7561c3b32d73650c5aa33ab03f24ee0f906391310b3d20da26aff003ff',
    'gc-867525fbdc2c090e': '59ce9e940b330d5f6fd46d33d8b47e6ce7db38a8e7b4a5bfb37d80066ee89ce3',
}
CURRENT_ACTIVE_SHA = '095cdf02f54645262111f4caf3a35f63e2f7e671d9497d5f4f5bc2f010c8ca36'
CURRENT_HOLDOUT_SHA = 'ce69e556a07874b117aeeb99ffdf089bfb968509ed16d7af74a6996647233fd8'
CURRENT_HOLDOUT_RECORDS = {
    'gc-011fb671e1563de7': 'f90170c4fcb063bb52d32274c5a306035d2fc5745f4d639be610d928a51bca1d',
    'gc-ebafb273d0dd2430': '8e105fd4de8822eeae7642d13c80ae727cbaeefdfcef1ae17fd4dd72a97989d5',
    'gc-5ca93d52b2f41823': 'dc2bd78800de325e853b061213ea016372bc21b5a4cb83d0967322a53f195b7b',
}
EXPOSURE_ARCHIVE = SPEC / 'archive' / 'exposure-20260726T234755Z'
EXPOSED_CASE_ID = 'gc-f4a583ea1d73f274'
EXPOSED_ORIGINAL_SHA = 'bd35acc49fde519f802b4d9e4c19f31fc630351529a89479eb263ca52d5efd39'
EXPOSED_PROMOTED_SHA = 'b58185a84150dae674bc4ac999631fd26d262089df29ef4b48e9e21a3c1baf6b'
EXPOSURE_PRE_HOLDOUT_SHA = '4fc87e7e2a846ce0041d3e656aaa09be4c8b5dbe6acd233711c38c95f9f673bb'
EXPOSURE_POST_PROMOTION_HOLDOUT_SHA = '76b852aff6868407a46ad0d9ff5df021b123c34e25041b29d02b61db7e05c99d'
EXPOSURE_FINAL_ACTIVE_SHA = 'bf026f36713100eec66bff30a34fedb978e7fb45968068bddd31402af895d4cd'
EXPOSURE_REPLACEMENT_ID = 'gc-867525fbdc2c090e'
EXPOSURE_REPLACEMENT_SHA = '59ce9e940b330d5f6fd46d33d8b47e6ce7db38a8e7b4a5bfb37d80066ee89ce3'
FAILED_REPLACEMENT_ARCHIVE = SPEC / 'archive' / 'run-20260727T002809Z-ac40e6'
FAILED_REPLACEMENT_RUN_SHA = 'e508cf56e0d0e0f5ff060af03f8976ebb4b8e73cc481e2d1090c98b96e560bab'
INSPECTION_ARCHIVE = SPEC / 'archive' / 'inspection-20260727T041105Z'
INSPECTION_RECEIPT_SHA = '12f0d6d8812a5b2cee513987106619e2f7c6061c730630aae26383c26715a81f'
FINAL_AUDIT_RECEIPT_SHA = 'f8c4ddeed40e0d30a9c9e76547a4cd74c575a21b489f6f9d0009119abeefbeb5'
INTERRUPTED_RUN_ARCHIVE = SPEC / 'archive' / 'run-20260727T052802Z-97d384-interrupted'
INTERRUPTED_ATTEMPT_SHA = '8e0a1de1c5dc3bc22ca1b508a0d796c95121e1c561f69ac3c8acd9e30b202a34'
ADR0050_ROTATION_ARCHIVE = SPEC / 'archive' / 'adr-0050-20260726'
NEXT16_PROXY_ARCHIVE = SPEC / 'archive' / 'next16-proxy-20260726'
ADR0050_CONTAMINATED_ID = 'gc-6e4d655c2e0f8997'
ADR0050_CONTAMINATED_SHA = '72dbb40fbd1e686c5224f9c5ffb8260e325999943590a0d3c4dbe5acade40ca7'
PRODUCT_BOUNDARY_ARCHIVE = SPEC / 'archive' / 'v2-product-boundary-20260719'
RETIRED_ATTACH_SOURCE_SHA = '49850946fa91d63e868bf4e58585565ac6281b32ffbee4cabc6ffa374f3895a2'
RETIRED_ATTACH_CASES_SHA = '47fc8a7bef5b818bb6a64139f80e7c032db2d87fec6425a5c8d73abe0913e8b4'
FORBIDDEN_ECHOES = {'Task ID:', 'Working directory:', 'Intent:'}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def contract_digest(case: dict) -> str:
    encoded = json.dumps(
        {'input': case['input'], 'checks': case['checks']},
        sort_keys=True,
        separators=(',', ':'),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


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
assert len(source_alignment) == 2
assert all(item['human_verdict'] == 'pass' for item in source_alignment)
assert all('genuine empty' in item['output'] and 'array' in item['output'] for item in source_alignment)
api_alignment = [item for item in alignment if item['failure_mode'] == 'api-change-not-implementable']
assert len(api_alignment) == 1 and api_alignment[0]['human_verdict'] == 'fail'
assert '`targetProject` is already in every API response' in api_alignment[0]['output']
assert 'query-param filter' in api_alignment[0]['output']
assert digest(SPEC / 'judge' / 'alignment.jsonl') == RUN_BEEA83_ALIGNMENT_SHA

v1_cases = load_jsonl(v1_active_path) + load_jsonl(v1_holdout_path)
assert len(v1_cases) == 14
for case in v1_cases:
    required = {check.get('value') for check in case['checks'] if check['kind'] == 'contains'}
    assert FORBIDDEN_ECHOES <= required, f"v1 evidence no longer demonstrates echo contamination: {case['id']}"

active = load_jsonl(SPEC / 'golden' / 'cases.jsonl')
holdout = load_jsonl(SPEC / 'golden' / 'holdout.jsonl')
assert len(active) == 15
assert len(holdout) == 3
assert digest(SPEC / 'golden' / 'holdout.jsonl') == CURRENT_HOLDOUT_SHA
replacement_record_hashes = {
    json.loads(line)['id']: hashlib.sha256(line.encode()).hexdigest()
    for line in (SPEC / 'golden' / 'holdout.jsonl').read_text().splitlines(keepends=True)
}
assert replacement_record_hashes == CURRENT_HOLDOUT_RECORDS
adr0050_rotation = json.loads((ADR0050_ROTATION_ARCHIVE / 'contamination-receipt.json').read_text())
assert adr0050_rotation['status'] == 'contaminated_and_rotated'
assert adr0050_rotation['content_used_for_prompt_iteration'] is False
assert adr0050_rotation['outputs_inspected'] is False
assert adr0050_rotation['contaminated_case_id'] == ADR0050_CONTAMINATED_ID
assert adr0050_rotation['archived_record_sha256'] == ADR0050_CONTAMINATED_SHA
assert adr0050_rotation['post_transition_holdout_sha256'] == ADR0050_REPLACEMENT_HOLDOUT_SHA
assert adr0050_rotation['replacement_case_id'] in ADR0050_REPLACEMENT_HOLDOUT_RECORDS
assert digest(ADR0050_ROTATION_ARCHIVE / 'contaminated-obsolete-case.jsonl') == ADR0050_CONTAMINATED_SHA
exposure_receipt = json.loads((EXPOSURE_ARCHIVE / 'exposure-receipt.json').read_text())
sealing_receipt = json.loads((EXPOSURE_ARCHIVE / 'sealing-receipt.json').read_text())
assert exposure_receipt['status'] == 'contaminated_and_promoted'
assert exposure_receipt['content_used_for_prompt_iteration'] is False
assert exposure_receipt['outputs_inspected_after_exposure'] is False
assert exposure_receipt['contaminated_case_id'] == EXPOSED_CASE_ID
assert exposure_receipt['pre_transition_holdout_sha256'] == EXPOSURE_PRE_HOLDOUT_SHA
assert exposure_receipt['post_transition_holdout_sha256'] == EXPOSURE_POST_PROMOTION_HOLDOUT_SHA
assert exposure_receipt['replacement_case_id'] == EXPOSURE_REPLACEMENT_ID
assert exposure_receipt['replacement_record_sha256'] == EXPOSURE_REPLACEMENT_SHA
assert digest(EXPOSURE_ARCHIVE / 'contaminated-case-original.jsonl') == EXPOSED_ORIGINAL_SHA
assert digest(SPEC / 'golden' / 'cases.jsonl') == CURRENT_ACTIVE_SHA
current_active_record_hashes = {
    json.loads(line)['id']: hashlib.sha256(line.encode()).hexdigest()
    for line in (SPEC / 'golden' / 'cases.jsonl').read_text().splitlines(keepends=True)
}
assert current_active_record_hashes[EXPOSED_CASE_ID] == EXPOSED_PROMOTED_SHA
assert EXPOSED_CASE_ID not in {case['id'] for case in holdout}
assert sealing_receipt['replacement_case_id'] == EXPOSURE_REPLACEMENT_ID
assert sealing_receipt['replacement_record_sha256'] == EXPOSURE_REPLACEMENT_SHA
assert sealing_receipt['final_active_sha256'] == EXPOSURE_FINAL_ACTIVE_SHA
assert sealing_receipt['final_holdout_sha256'] == FAILED_REPLACEMENT_POOL_SHA
assert sealing_receipt['final_active_count'] == 14
assert sealing_receipt['final_holdout_count'] == 3
assert sealing_receipt['prompt_changes_after_sealing'] is False
assert sealing_receipt['candidate_plaintext_retained_outside_holdout'] is False
assert not (EXPOSURE_ARCHIVE / 'clean-room-candidate.json').exists()

failed_replacement_receipt = json.loads((FAILED_REPLACEMENT_ARCHIVE / 'burn-receipt.json').read_text())
assert failed_replacement_receipt['run_id'] == 'run-20260727T002809Z-ac40e6'
assert failed_replacement_receipt['run_sha256'] == FAILED_REPLACEMENT_RUN_SHA
assert failed_replacement_receipt['aggregate'] == 0.9412
assert failed_replacement_receipt['unknown_ratio'] == 0.0
assert failed_replacement_receipt['failed_case_id'] == EXPOSURE_REPLACEMENT_ID
assert failed_replacement_receipt['failed_record_sha256'] == EXPOSURE_REPLACEMENT_SHA
assert failed_replacement_receipt['pre_transition_active_sha256'] == EXPOSURE_FINAL_ACTIVE_SHA
assert failed_replacement_receipt['pre_transition_holdout_sha256'] == FAILED_REPLACEMENT_POOL_SHA
assert failed_replacement_receipt['post_transition_active_sha256'] == CURRENT_ACTIVE_SHA
assert failed_replacement_receipt['post_transition_holdout_sha256'] == EXPOSURE_POST_PROMOTION_HOLDOUT_SHA
assert failed_replacement_receipt['active_count_after_transition'] == 15
assert failed_replacement_receipt['sealed_count_after_transition'] == 2
assert failed_replacement_receipt['output_inspected_before_promotion'] is False
assert digest(FAILED_REPLACEMENT_ARCHIVE / 'burned-case-original.jsonl') == EXPOSURE_REPLACEMENT_SHA

inspection_receipt = json.loads((INSPECTION_ARCHIVE / 'contamination-receipt.json').read_text())
assert inspection_receipt['status'] == 'contaminated_and_rotated'
assert inspection_receipt['content_used_for_prompt_iteration'] is False
assert inspection_receipt['prompt_changed_from_contaminated_content'] is False
assert inspection_receipt['contaminated_holdout_sha256'] == EXPOSURE_POST_PROMOTION_HOLDOUT_SHA
assert inspection_receipt['contaminated_holdout_count'] == 2
assert inspection_receipt['contaminated_records'] == {
    'gc-51913b36c1570860': ADR0050_REPLACEMENT_HOLDOUT_RECORDS['gc-51913b36c1570860'],
    'gc-15d1a422f6b33458': ADR0050_REPLACEMENT_HOLDOUT_RECORDS['gc-15d1a422f6b33458'],
}
assert digest(INSPECTION_ARCHIVE / 'contaminated-holdout.jsonl') == EXPOSURE_POST_PROMOTION_HOLDOUT_SHA

final_audit_receipt = json.loads((FAILED_REPLACEMENT_ARCHIVE / 'replacement-audit-receipt.json').read_text())
final_sealing_receipt = json.loads((FAILED_REPLACEMENT_ARCHIVE / 'replacement-sealing-receipt.json').read_text())
assert digest(FAILED_REPLACEMENT_ARCHIVE / 'replacement-audit-receipt.json') == FINAL_AUDIT_RECEIPT_SHA
assert final_audit_receipt['provider'] == 'Anthropic'
assert final_audit_receipt['model'] == 'opus'
assert final_audit_receipt['tools'] == []
assert final_audit_receipt['session_persistence'] is False
assert final_audit_receipt['sealed_material_available'] is False
assert final_audit_receipt['verdict'] == 'APPROVE'
assert final_audit_receipt['candidate_count'] == 3
assert final_sealing_receipt['status'] == 'resealed_after_failed_holdout_burn_and_inspection_rotation'
assert final_sealing_receipt['audit']['receipt_sha256'] == FINAL_AUDIT_RECEIPT_SHA
assert final_sealing_receipt['inspection_rotation_receipt']['sha256'] == INSPECTION_RECEIPT_SHA
assert final_sealing_receipt['pre_transition_active_sha256'] == CURRENT_ACTIVE_SHA
assert final_sealing_receipt['pre_transition_holdout_sha256'] == EXPOSURE_POST_PROMOTION_HOLDOUT_SHA
assert final_sealing_receipt['replacement_record_sha256'] == CURRENT_HOLDOUT_RECORDS
assert final_sealing_receipt['final_active_sha256'] == CURRENT_ACTIVE_SHA
assert final_sealing_receipt['final_holdout_sha256'] == CURRENT_HOLDOUT_SHA
assert final_sealing_receipt['final_active_count'] == 15
assert final_sealing_receipt['final_holdout_count'] == 3
assert final_sealing_receipt['prompt_changes_after_sealing'] is False
assert final_sealing_receipt['candidate_plaintext_retained_outside_holdout'] is False
assert final_sealing_receipt['novelty']['active_and_burned_exact_duplicates'] == 0
assert final_sealing_receipt['novelty']['contaminated_definitions_opened_for_comparison'] is False
for candidate_path in (
    EXPOSURE_ARCHIVE / 'clean-room-candidate.json',
    FAILED_REPLACEMENT_ARCHIVE / 'clean-room-candidate.json',
    ROOT / 'command-cleanroom-candidate.json',
):
    assert not candidate_path.exists()

interruption_receipt = json.loads((INTERRUPTED_RUN_ARCHIVE / 'interruption-receipt.json').read_text())
assert interruption_receipt['status'] == 'interrupted_not_eligible_as_release_evidence'
assert interruption_receipt['start_commit'] == '4f387b11c4f23d59ed6953671f568ff2a667f4fb'
assert interruption_receipt['prompt_changed_during_run'] is False
assert interruption_receipt['sealed_holdout_changed_during_run'] is False
assert interruption_receipt['source_tree_changed_during_run'] is True
assert interruption_receipt['baseline_updated'] is False
assert interruption_receipt['completed_cache_boundaries'] == 3
assert interruption_receipt['outputs_inspected'] is False
assert interruption_receipt['sealed_case_content_inspected'] is False
assert interruption_receipt['attempt_log']['sha256'] == INTERRUPTED_ATTEMPT_SHA
assert digest(INTERRUPTED_RUN_ARCHIVE / 'attempt-log.jsonl') == INTERRUPTED_ATTEMPT_SHA
rotation_archive = SPEC / 'archive' / RUN_3D168B
assert digest(rotation_archive / 'contaminated-holdout.jsonl') == CONTAMINATED_HOLDOUT_SHA
contaminated_record_hashes = {
    json.loads(line)['id']: hashlib.sha256(line.encode()).hexdigest()
    for line in (rotation_archive / 'contaminated-holdout.jsonl').read_text().splitlines(keepends=True)
}
assert contaminated_record_hashes == CONTAMINATED_HOLDOUT_RECORDS
rotation_receipt = json.loads((rotation_archive / 'contamination-receipt.json').read_text())
assert rotation_receipt['status'] == 'contaminated'
assert rotation_receipt['failed_run'] == {
    'id': RUN_3D168B,
    'sha256': RUN_3D168B_SHA,
    'aggregate': 0.75,
    'required_aggregate': 0.75,
    'status': 'failed',
}
assert rotation_receipt['contaminated_holdout']['sha256'] == CONTAMINATED_HOLDOUT_SHA
assert rotation_receipt['contaminated_holdout']['count'] == 3
assert {
    record['id']: record['sha256']
    for record in rotation_receipt['contaminated_holdout']['records']
} == CONTAMINATED_HOLDOUT_RECORDS
assert not ({case['id'] for case in active} & {case['id'] for case in holdout})
assert not ({case['id'] for case in holdout} & {case['id'] for case in v1_cases}), 'v2 holdouts must be freshly minted'
assert not ({case['id'] for case in active} & {case['id'] for case in retired_attach_cases})
assert all('attachLock.ts' not in case['input']['description'] for case in active)
active_record_hashes = {
    case['id']: hashlib.sha256(line.encode()).hexdigest()
    for line in (SPEC / 'golden' / 'cases.jsonl').read_text().splitlines(keepends=True)
    if (case := json.loads(line))
}
next16_proxy_receipt = json.loads((NEXT16_PROXY_ARCHIVE / 'migration-receipt.json').read_text())
assert next16_proxy_receipt['status'] == 'active_cases_retired_and_replaced'
assert next16_proxy_receipt['content_used_for_prompt_iteration'] is False
retired_next16_lines = (NEXT16_PROXY_ARCHIVE / 'retired-active-cases.jsonl').read_text().splitlines(keepends=True)
retired_next16_hashes = {
    json.loads(line)['id']: hashlib.sha256(line.encode()).hexdigest()
    for line in retired_next16_lines
}
next16_mappings = {
    record['id']: record
    for record in next16_proxy_receipt['retired_records']
}
assert retired_next16_hashes == {
    record_id: record['sha256']
    for record_id, record in next16_mappings.items()
}
assert set(boundary_manifest['replacement_active_case_ids']) <= (
    {case['id'] for case in active} | set(next16_mappings)
)
for record in next16_mappings.values():
    assert active_record_hashes[record['replacement_id']] == record['replacement_sha256']
    assert record['replacement_id'] not in next16_mappings
assert boundary_manifest['sealed_holdout_sha256'] == RUN_5A9247_PRE_HOLDOUT_SHA

# The failed sealed record stayed opaque until the generator mechanically
# archived and promoted its exact input/check contract. Passing records remain
# byte-identical and the replacement is pinned only by its opaque line hash.
burn_archive = SPEC / 'archive' / 'run-20260720T000322Z-5a9247'
burn_receipt = json.loads((burn_archive / 'failed-run-receipt.json').read_text())
assert burn_receipt['sha256'] == RUN_5A9247_SHA
assert set(burn_receipt['required_active_failures']) == RUN_5A9247_ACTIVE_FAILURES
assert burn_receipt['failed_sealed_case']['case_id'] == RUN_5A9247_BURNED_ID
assert burn_receipt['failed_sealed_case']['record_sha256'] == RUN_5A9247_BURNED_SHA
assert burn_receipt['failed_sealed_case']['input_checks_sha256'] == RUN_5A9247_BURNED_CONTRACT_SHA
assert burn_receipt['pre_transition_holdout_sha256'] == RUN_5A9247_PRE_HOLDOUT_SHA
assert burn_receipt['post_transition_active_sha256'] == RUN_5A9247_POST_ACTIVE_SHA
assert burn_receipt['post_transition_holdout_sha256'] == RUN_5A9247_POST_HOLDOUT_SHA
assert burn_receipt['replacement_record_sha256'] == RUN_5A9247_REPLACEMENT_SHA
assert burn_receipt['sealed_content_inspected_before_promotion'] is False
assert digest(burn_archive / 'burned-case.jsonl') == RUN_5A9247_BURNED_SHA
burned_case = load_jsonl(burn_archive / 'burned-case.jsonl')[0]
assert contract_digest(burned_case) == RUN_5A9247_BURNED_CONTRACT_SHA
promoted = [case for case in active if case['id'] == RUN_5A9247_BURNED_ID]
assert len(promoted) == 1
assert contract_digest(promoted[0]) == RUN_5A9247_BURNED_CONTRACT_SHA
assert promoted[0]['status'] == 'active' and promoted[0]['provenance'] == 'production'
assert 'run-20260720T000322Z-5a9247' in promoted[0]['source']
assert RUN_5A9247_BURNED_ID not in {case['id'] for case in holdout}
assert digest(SPEC / 'archive' / RUN_3D168B / 'contaminated-holdout.jsonl') == RUN_0FDDA5_POST_HOLDOUT_SHA
sealed_line_shas = {
    hashlib.sha256((line + '\n').encode()).hexdigest()
    for line in (SPEC / 'archive' / RUN_3D168B / 'contaminated-holdout.jsonl').read_text().splitlines()
    if line.strip()
}
assert sealed_line_shas == RUN_5A9247_PRESERVED_RECORD_SHAS | {RUN_0FDDA5_FINAL_REPLACEMENT_SHA}

# Root review exposed one sealed case after run 0fdda5. Its original record is
# archived exactly, absent from the current holdout, and replaced canonically.
run_0f_archive = SPEC / 'archive' / 'run-20260720T053721Z-0fdda5'
run_0f_receipt = json.loads((run_0f_archive / 'failed-run-receipt.json').read_text())
assert run_0f_receipt['runtime_path'] == str(RUN_0FDDA5)
assert run_0f_receipt['sha256'] == RUN_0FDDA5_SHA
assert run_0f_receipt['gate_passed'] is False
assert run_0f_receipt['sole_substantive_failure']['case_id'] == 'gc-0208a8225000a225'
assert run_0f_receipt['sole_substantive_failure']['classification'] == 'substantive_model_output_failure'
assert set(run_0f_receipt['evaluator_format_failures']) == RUN_0FDDA5_FORMAT_FAILURES
assert run_0f_receipt['shared_evaluator_correction_commit'] == 'd1005d4'
assert run_0f_receipt['provider_provenance']['private_transcript_content_copied'] is False
assert run_0f_receipt['burned_sealed_case']['case_id'] == RUN_0FDDA5_BURNED_ID
assert run_0f_receipt['burned_sealed_case']['record_sha256'] == RUN_0FDDA5_BURNED_SHA
assert digest(run_0f_archive / 'burned-case.jsonl') == RUN_0FDDA5_BURNED_SHA
assert digest(run_0f_archive / 'contaminated-replacement.jsonl') == RUN_0FDDA5_REPLACEMENT_SHA
assert run_0f_receipt['pre_transition_holdout_sha256'] == RUN_5A9247_POST_HOLDOUT_SHA
assert run_0f_receipt['post_transition_holdout_sha256'] == RUN_0FDDA5_POST_HOLDOUT_SHA
assert run_0f_receipt['replacement']['case_id'] == RUN_0FDDA5_REPLACEMENT_ID
assert run_0f_receipt['replacement']['record_sha256'] == RUN_0FDDA5_REPLACEMENT_SHA
assert run_0f_receipt['replacement']['must_pass'] is True
assert run_0f_receipt['replacement']['judge_failure_mode_count'] >= 3
assert run_0f_receipt['replacement']['disposition'] == 'retired_after_parent_review_contamination'
assert run_0f_receipt['replacement']['contamination_source_commit'] == '6c15d8e'
assert run_0f_receipt['replacement']['archive_file'] == 'contaminated-replacement.jsonl'
assert run_0f_receipt['final_replacement']['case_id'] == RUN_0FDDA5_FINAL_REPLACEMENT_ID
assert run_0f_receipt['final_replacement']['record_sha256'] == RUN_0FDDA5_FINAL_REPLACEMENT_SHA
assert run_0f_receipt['final_replacement']['must_pass'] is True
assert run_0f_receipt['final_replacement']['judge_failure_mode_count'] >= 3
holdout_ids = {case['id'] for case in holdout}
assert RUN_0FDDA5_BURNED_ID not in holdout_ids
assert RUN_0FDDA5_REPLACEMENT_ID not in holdout_ids
assert RUN_0FDDA5_FINAL_REPLACEMENT_ID not in holdout_ids
assert digest(SPEC / 'archive' / RUN_3D168B / 'contaminated-holdout.jsonl') == RUN_0FDDA5_POST_HOLDOUT_SHA
replacement_lines = [
    line for line in (SPEC / 'archive' / RUN_3D168B / 'contaminated-holdout.jsonl').read_text().splitlines(keepends=True)
    if json.loads(line)['id'] == RUN_0FDDA5_FINAL_REPLACEMENT_ID
]
assert len(replacement_lines) == 1
assert hashlib.sha256(replacement_lines[0].encode()).hexdigest() == RUN_0FDDA5_FINAL_REPLACEMENT_SHA
if RUN_0FDDA5.exists():
    assert digest(RUN_0FDDA5) == RUN_0FDDA5_SHA
    run_0f = json.loads(RUN_0FDDA5.read_text())
    assert run_0f['release'] is True and run_0f['cached_allowed'] is False
    assert run_0f['gate']['passed'] is False and run_0f['judge_unknown_ratio'] == 0.0833
    failed_ids = {case_id for case_id, result in run_0f['cases'].items() if not result['pass']}
    assert failed_ids == RUN_0FDDA5_FORMAT_FAILURES | {'gc-0208a8225000a225'}
if RUN_5A9247.exists():
    assert digest(RUN_5A9247) == RUN_5A9247_SHA
    run_5a9247 = json.loads(RUN_5A9247.read_text())
    assert run_5a9247['release'] is True and run_5a9247['cached_allowed'] is False
    assert run_5a9247['judge_unknown_ratio'] == 0.0 and run_5a9247['gate']['passed'] is False
    failed_ids = {case_id for case_id, result in run_5a9247['cases'].items() if not result['pass']}
    assert failed_ids == RUN_5A9247_ACTIVE_FAILURES | {RUN_5A9247_BURNED_ID}
for case_id, (name, expected_sha) in RUN_5A9247_CACHES.items():
    path = cache_root / name
    if path.exists():
        assert digest(path) == expected_sha, f'5a9247 active cache drifted: {case_id}'

beea_archive = SPEC / 'archive' / 'run-20260720T030721Z-beea83'
beea_receipt = json.loads((beea_archive / 'failed-run-receipt.json').read_text())
assert beea_receipt['sha256'] == RUN_BEEA83_SHA
assert set(beea_receipt['required_active_failures']) == RUN_BEEA83_FAILURES
assert beea_receipt['judge_unknown_ratio'] == 0.0417
assert beea_receipt['sealed_results'] == {'count': 3, 'passed': 3, 'content_inspected': False}
assert beea_receipt['promoted_production_result'] == {
    'case_id': RUN_5A9247_BURNED_ID,
    'passed': True,
}
assert beea_receipt['required_active_failures']['gc-466822e89b2392f2']['classification'] == 'strict_parser_or_judge_output'
assert beea_receipt['required_active_failures']['gc-466822e89b2392f2']['human_output_assessment'] == 'pass'
assert beea_receipt['required_active_failures']['gc-19391fb63459606e']['classification'] == 'strict_parser_plus_model_contract_error'
assert beea_receipt['required_active_failures']['gc-beeffc8ebf868689']['classification'] == 'model_output_failure'
assert beea_receipt['strict_parser_evidence']['affected_checks'] == 2
assert beea_receipt['strict_parser_evidence']['fixed_upstream_commit'] == '496444b43b9f28a970f50a3c7d4d72ca51c8b9c7'
assert 'JSONDecoder.raw_decode' in beea_receipt['strict_parser_evidence']['upstream_fix']
assert beea_receipt['preserved_active_sha256'] == RUN_BEEA83_PRESERVED_ACTIVE_SHA
assert beea_receipt['preserved_holdout_sha256'] == RUN_5A9247_POST_HOLDOUT_SHA
assert beea_receipt['judge_alignment_sha256'] == RUN_BEEA83_ALIGNMENT_SHA
if RUN_BEEA83.exists():
    assert digest(RUN_BEEA83) == RUN_BEEA83_SHA
    beea_run = json.loads(RUN_BEEA83.read_text())
    assert beea_run['release'] is True and beea_run['cached_allowed'] is False
    assert beea_run['judge_unknown_ratio'] == 0.0417 and not beea_run['gate']['passed']
    failed_ids = {case_id for case_id, result in beea_run['cases'].items() if not result['pass']}
    assert failed_ids == RUN_BEEA83_FAILURES
    assert beea_run['cases'][RUN_5A9247_BURNED_ID]['pass'] is True
    sealed = [result for result in beea_run['cases'].values() if result['status'] == 'holdout']
    assert len(sealed) == 3 and all(result['pass'] for result in sealed)
for case_id, (name, expected_sha) in RUN_BEEA83_CACHES.items():
    path = cache_root / name
    if path.exists():
        assert digest(path) == expected_sha, f'beea83 active cache drifted: {case_id}'

run_452_archive = SPEC / 'archive' / 'run-20260720T035742Z-452d63'
run_452_receipt = json.loads((run_452_archive / 'failed-run-receipt.json').read_text())
assert run_452_receipt['sha256'] == RUN_452D63_SHA
assert run_452_receipt['aggregate'] == 0.9375
assert run_452_receipt['judge_unknown_ratio'] == 0.0
assert run_452_receipt['sealed_results'] == {'count': 3, 'passed': 3, 'content_inspected': False}
assert run_452_receipt['sole_required_failure'] == {
    'case_id': RUN_5A9247_BURNED_ID,
    'status': 'active',
    'provenance': 'production',
    'failure_mode': 'release-safety-diagnosis-ungrounded',
    'verdict': 'fail',
    'classification': 'substantive_model_output_failure',
    'detail': 'omitted configured readiness target and substituted a static grep for the existing behavioral A-to-B-to-A dependency-identity regression',
}
assert run_452_receipt['preserved_active_sha256'] == RUN_5A9247_POST_ACTIVE_SHA
assert run_452_receipt['preserved_holdout_sha256'] == RUN_5A9247_POST_HOLDOUT_SHA
if RUN_452D63.exists():
    assert digest(RUN_452D63) == RUN_452D63_SHA
    run_452 = json.loads(RUN_452D63.read_text())
    assert run_452['release'] is True and run_452['cached_allowed'] is False
    assert run_452['judge_unknown_ratio'] == 0.0 and not run_452['gate']['passed']
    failed_ids = {case_id for case_id, result in run_452['cases'].items() if not result['pass']}
    assert failed_ids == {RUN_5A9247_BURNED_ID}
    sealed = [result for result in run_452['cases'].values() if result['status'] == 'holdout']
    assert len(sealed) == 3 and all(result['pass'] for result in sealed)
run_452_cache = cache_root / RUN_452D63_CACHE[0]
if run_452_cache.exists():
    cached = json.loads(run_452_cache.read_text())
    assert cached['case'] == RUN_5A9247_BURNED_ID
    if cached['ts'] == '2026-07-20T03:49:05Z':
        assert digest(run_452_cache) == RUN_452D63_CACHE[1]
    else:
        assert cached['ts'] > '2026-07-20T03:49:05Z'

run_acd_archive = SPEC / 'archive' / 'run-20260720T043613Z-acd532'
run_acd_receipt = json.loads((run_acd_archive / 'failed-run-receipt.json').read_text())
assert run_acd_receipt['sha256'] == RUN_ACD532_SHA
assert run_acd_receipt['aggregate'] == 0.9375
assert run_acd_receipt['judge_unknown_ratio'] == 0.0
assert run_acd_receipt['sealed_results'] == {'count': 3, 'passed': 3, 'content_inspected': False}
assert run_acd_receipt['sole_required_failure'] == {
    'case_id': 'gc-466822e89b2392f2',
    'status': 'active',
    'provenance': 'synthetic',
    'failure_mode': 'debugging-without-source-grounding',
    'verdict': 'fail',
    'classification': 'substantive_model_output_failure',
    'detail': 'disproved the reported source mechanism but blurred source-invariant closure with incident-root-cause closure and omitted the specific runtime evidence needed to identify the actual cause',
}
assert run_acd_receipt['preserved_active_sha256'] == RUN_5A9247_POST_ACTIVE_SHA
assert run_acd_receipt['preserved_holdout_sha256'] == RUN_5A9247_POST_HOLDOUT_SHA
if RUN_ACD532.exists():
    assert digest(RUN_ACD532) == RUN_ACD532_SHA
    run_acd = json.loads(RUN_ACD532.read_text())
    assert run_acd['release'] is True and run_acd['cached_allowed'] is False
    assert run_acd['judge_unknown_ratio'] == 0.0 and not run_acd['gate']['passed']
    failed_ids = {case_id for case_id, result in run_acd['cases'].items() if not result['pass']}
    assert failed_ids == {'gc-466822e89b2392f2'}
    sealed = [result for result in run_acd['cases'].values() if result['status'] == 'holdout']
    assert len(sealed) == 3 and all(result['pass'] for result in sealed)
run_acd_cache = cache_root / RUN_ACD532_CACHE[0]
if run_acd_cache.exists():
    cached = json.loads(run_acd_cache.read_text())
    assert cached['case'] == 'gc-466822e89b2392f2'
    if cached['ts'] == '2026-07-20T04:04:46Z':
        assert digest(run_acd_cache) == RUN_ACD532_CACHE[1]
    else:
        assert cached['ts'] > '2026-07-20T04:04:46Z'

fixed_case = next(case for case in active if case['input']['task_id'] == 't-fix-03')
fixed_rubric = next(check['rubric'] for check in fixed_case['checks'] if check.get('failure_mode') == 'already-fixed-state-missed')
assert 'src/lib/observatory.ts' in fixed_rubric
assert 'basename(dirname(path))' in fixed_rubric

small_edit_case = next(case for case in active if case['input']['task_id'] == 't-docs-07')
small_edit_rubric = next(check['rubric'] for check in small_edit_case['checks'] if check.get('failure_mode') == 'exact-small-edit-missing')
assert 'src/proxy.ts' in small_edit_rubric
assert 'PUBLIC_PATHS' in small_edit_rubric

smoke_case = next(case for case in active if case['input']['task_id'] == 't-smoke-04')
goal_rubric = next(check['rubric'] for check in smoke_case['checks'] if check.get('failure_mode') == 'goal-not-addressed')
assert 'probe lacks execution authority' in goal_rubric
assert 'exact command and working directory' in goal_rubric
assert 'do not require execution that the probe contract forbids' in goal_rubric
smoke_rubric = next(check['rubric'] for check in smoke_case['checks'] if check.get('failure_mode') == 'fabricated-execution-evidence')
for required in ('no execution output exists', 'static predictions', 'Actual', 'PASS', 'FAIL',
                 'observed status codes', 'command output', 'grep confirmation',
                 'synthesized test summary or count'):
    assert required in smoke_rubric, f'missing unavailable-execution rubric invariant: {required}'

prompt_source = (ROOT / 'src' / 'prompts' / 'codex-task-prompt.md').read_text()
for required in ('explicitly say that no execution output exists', 'clearly labeled static predictions',
                 'Actual, PASS, FAIL', 'observed status codes', 'command output',
                 'grep confirmation', 'synthesized test summary or count'):
    assert required in prompt_source, f'missing unavailable-execution prompt invariant: {required}'
for required in ('write ordering', 'partial-failure recovery', 'idempotent replay or backfill',
                 'authoritative producer ownership', 'acknowledged atomicity gaps'):
    assert required in prompt_source, f'missing coupled-store durability contract: {required}'
for required in (
    'Treat explicitly named interface elements',
    'status prose, inventory labels, and prior completion statements as assertions to verify',
    'Inspect the underlying per-item artifacts and their current acceptance fields',
    'A differently named value with similar meaning does not satisfy the requested contract',
    'do not substitute adjacent behavior such as server-side filtering',
    'When inspection proves that the reported defect is unreachable',
    'Do not invent hypothetical environments or propose a behavior-preserving refactor',
    'Keep source-invariant closure separate from incident-root-cause closure',
    'state that no source edit is warranted, but do not claim the observed incident is explained',
    'original stack trace with current line or source-map mapping',
    'the triggering payload, the deployed runtime revision, or a reproduction trace',
    'Name the exact readiness endpoint and the configuration source that selects it',
    'switches from release A to release B and back to A',
    'each selected release remains paired with its own dependency identity',
    'static source-text or grep assertions do not prove that runtime invariant',
    'must not replace an existing behavioral regression',
):
    assert required in prompt_source, f'missing exact-contract or no-change rule: {required}'

debug_case = next(case for case in active if case['input']['task_id'] == 't-debug-01')
debug_rubric = next(check['rubric'] for check in debug_case['checks'] if check.get('failure_mode') == 'debugging-without-source-grounding')
assert debug_case['must_pass'] is True
assert 'determines whether secret rotation is resolved per call' in debug_rubric
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
holdout_before = (SPEC / 'golden' / 'holdout.jsonl').read_bytes()
targeted_result = run_generator('--prompt-id', 'codex-task-prompt')
assert targeted_result.returncode == 0, targeted_result.stderr
assert 'codex-task-prompt: 15 active' in targeted_result.stdout
assert (SPEC / 'golden' / 'holdout.jsonl').read_bytes() == holdout_before, 'sealed holdout bytes changed'
assert snapshot_eval_files() == before, 'targeted regeneration was non-idempotent or crossed prompt boundaries'

rewrite_result = run_generator('--prompt-id', 'codex-task-prompt', '--rewrite-holdouts')
assert rewrite_result.returncode != 0
assert (SPEC / 'golden' / 'holdout.jsonl').read_bytes() == holdout_before, 'rejected option changed sealed holdout bytes'
assert snapshot_eval_files() == before, 'rejected sealed option crossed prompt boundaries'

print('codex-task-prompt v2 contract, archive provenance, and generator safety tests passed')
