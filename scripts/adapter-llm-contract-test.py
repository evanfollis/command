#!/usr/bin/env python3
"""Deterministic neutrality and provider-payload checks for eval adapters."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'prompteval-adapters'))

import adapter_llm  # noqa: E402

EXPECTED_PREFIX = (
    'Prompt-evaluation probe rooted at /opt/workspace. Capability context only: real read '
    'tools (Read, Grep, Glob) are available for workspace inspection. Write and '
    'command-execution tools are unavailable. Distinguish truthfully between workspace state '
    'you inspected, changes described as proposals, and operations actually performed. Never '
    'claim that the probe wrote, changed, or executed something it did not. Output only the '
    'user-facing reply.\n\n'
)
assert adapter_llm.PROBE_PREFIX == EXPECTED_PREFIX
assert 'real read tools (Read, Grep, Glob) are available' in adapter_llm.PROBE_PREFIX
assert 'Write and command-execution tools are unavailable' in adapter_llm.PROBE_PREFIX
assert 'Distinguish truthfully' in adapter_llm.PROBE_PREFIX
assert 'Never claim that the probe wrote, changed, or executed something it did not' in adapter_llm.PROBE_PREFIX

for forbidden in (
    r'\bask(?:ing|ed)?\b',
    r'\bdefer(?:ring|red|s)?\b',
    r'\bescalat(?:e|es|ed|ing|ion)\b',
    r'\bpermission\b',
    r'\bconfirm(?:ation|ed|ing)?\b',
    r'\bexact artifact\b',
    r'\bshow the exact\b',
    r'\bdo the full work\b',
    r'\brather than\b',
):
    assert not re.search(forbidden, adapter_llm.PROBE_PREFIX, re.IGNORECASE), forbidden

governed_prompt = 'GOVERNED_FRAME_SENTINEL'
message = 'USER_MESSAGE_SENTINEL'
combined = f'{governed_prompt}\n\n---\n\n{message}'

for model, expected_first in (
    ('claude-sonnet-4-6', 'claude'),
    ('gpt-5.2-codex', 'codex'),
):
    calls = adapter_llm._calls_for_prompt(
        combined,
        model,
        governed_prompt,
        message,
    )
    assert [call.provider for call in calls][0] == expected_first
    by_provider = {call.provider: call for call in calls}
    assert set(by_provider) == {'claude', 'codex'}

    claude = by_provider['claude']
    append_flag = '--append-' + 'system-' + 'prompt'
    append_index = claude.cmd.index(append_flag)
    assert claude.cmd[append_index + 1] == EXPECTED_PREFIX + governed_prompt
    assert claude.cmd[-1] == message
    assert claude.input_text == f'{EXPECTED_PREFIX}{governed_prompt}\n{message}'
    assert claude.cwd == adapter_llm.PROBE_CWD

    codex = by_provider['codex']
    assert codex.stdin_text == EXPECTED_PREFIX + combined
    assert codex.input_text == EXPECTED_PREFIX + combined
    assert codex.cwd == adapter_llm.PROBE_CWD

print('adapter capability neutrality and Claude/Codex payload contracts passed')
