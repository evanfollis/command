"""Shared LLM execution for Command prompt-eval adapters."""

from __future__ import annotations

import os
import sys

PROMPTEVAL_LIB = os.environ.get(
    "PROMPTEVAL_LIB", "/opt/workspace/supervisor/scripts/lib"
)
if PROMPTEVAL_LIB not in sys.path:
    sys.path.insert(0, PROMPTEVAL_LIB)

from prompteval.llm import (  # noqa: E402
    AllProvidersThrottled,
    CliCall,
    LLMCallError,
    fallback_model,
    provider_for_model,
    run_with_fallback,
)


# Establishes the probe's environment, and NOTHING about how to behave in it.
#
# The version before 2026-07-12 also told the model to "avoid confirmation phrases such as
# 'if you want', 'want me to', 'should I', or 'proceed'" — precisely what the permission
# judge failed on. It answered its own grader: with an entirely EMPTY governed prompt, the
# permission cases still passed. The loop was measuring this string, not the prompt.
#
# Nothing here may state or imply whether the assistant should act, ask, defer, or escalate.
# That is the behavior under test. What it MAY do is describe the environment truthfully, so
# the model is not punished for a limitation of the harness (see PROBE_TOOLS below).
PROBE_PREFIX = (
    "Prompt-evaluation probe, rooted at /opt/workspace. You have real read tools (Read, Grep, "
    "Glob) — use them to inspect the workspace as you normally would. You have no write or "
    "execute tools here, so for any change you would make, do the full work up front and show "
    "the exact artifact — the file content, the diff, the commit message, the command — rather "
    "than deferring it. Do not claim a change has already been applied. Output only the "
    "user-facing reply.\n\n"
)


def _codex_cmd(model: str) -> list[str]:
    cmd = [
        "codex",
        "-c",
        'approval_policy="untrusted"',
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
    ]
    if model:
        cmd += ["--model", model]
    return cmd + ["-"]


# The executive thread's real runtime has full tools at /opt/workspace. Evaluating an
# action-default prompt with tools disabled is a category error: the behavior under test is
# *whether the assistant does the work*, and a probe with no tools cannot do any. The model
# then honestly reports a blocker ("run cat yourself / paste the file"), the judge scores it
# as deferral, and the loop punishes the prompt for the harness's limitation. That confound
# is what the old PROBE_PREFIX was suppressing by telling the model what to say — which is
# how it ended up answering its own grader.
#
# So give the probe REAL read tools, rooted where the real thread runs. Inspection is now
# genuine; only mutation is simulated. Write/Edit/Bash are deliberately absent — an eval run
# must never mutate the workspace.
PROBE_TOOLS = "Read,Grep,Glob"
PROBE_CWD = "/opt/workspace"


def _claude_text_cmd(model: str, *args: str) -> list[str]:
    return [
        "claude",
        "-p",
        "--tools",
        PROBE_TOOLS,
        "--disable-slash-commands",
        "--model",
        model,
        *args,
    ]


def _telemetry(payload: dict, prompt_id: str) -> dict:
    telemetry = payload.get("telemetry") or {}
    return {
        "project": telemetry.get("project", "command"),
        "prompt_id": telemetry.get("prompt_id", prompt_id),
        "case_id": telemetry.get("case_id", ""),
        "trial": telemetry.get("trial"),
    }


def _calls_for_prompt(
    prompt: str,
    model: str,
    system_prompt: str | None = None,
    message: str | None = None,
) -> list[CliCall]:
    probe_prompt = PROBE_PREFIX + prompt
    primary = provider_for_model(model, default="claude")
    codex_model = model if primary == "codex" else fallback_model("codex")
    claude_model = model if primary == "claude" else fallback_model("claude")
    if system_prompt is not None:
        probe_system_prompt = PROBE_PREFIX + system_prompt
        claude_cmd = _claude_text_cmd(
            claude_model, "--append-system-prompt", probe_system_prompt, message or ""
        )
        claude_input = f"{probe_system_prompt}\n{message or ''}"
    else:
        claude_cmd = _claude_text_cmd(claude_model, probe_prompt)
        claude_input = probe_prompt

    codex_call = CliCall(
        "codex",
        codex_model,
        _codex_cmd(codex_model),
        stdin_text=probe_prompt,
        input_text=probe_prompt,
        fallback_from="claude" if primary == "claude" else "",
        cwd=PROBE_CWD,
    )
    claude_call = CliCall(
        "claude",
        claude_model,
        claude_cmd,
        input_text=claude_input,
        fallback_from="codex" if primary == "codex" else "",
        cwd=PROBE_CWD,
    )
    return [claude_call, codex_call] if primary == "claude" else [codex_call, claude_call]


def run_prompt(prompt: str, model: str, payload: dict, prompt_id: str) -> str:
    return run_with_fallback(
        _calls_for_prompt(prompt, model),
        timeout=300,
        role="executor-adapter",
        **_telemetry(payload, prompt_id),
    )


def run_prompt_with_system(
    system_prompt: str,
    message: str,
    model: str,
    payload: dict,
    prompt_id: str,
) -> str:
    prompt = f"{system_prompt}\n\n---\n\n{message}"
    return run_with_fallback(
        _calls_for_prompt(prompt, model, system_prompt=system_prompt, message=message),
        timeout=300,
        role="executor-adapter",
        **_telemetry(payload, prompt_id),
    )


def print_result(call) -> int:
    try:
        print(call(), end="")
        return 0
    except AllProvidersThrottled as exc:
        sys.stderr.write(f"{exc}\n")
        return 75
    except LLMCallError as exc:
        sys.stderr.write(f"{exc}\n")
        return 1


def render_via_runtime(prompt_id: str, template: str, case_input: dict) -> str:
    """Render through the shipped TypeScript builder (scripts/render-prompt.ts).

    Adapters must never re-implement substitution: the Python and TS renderers drifted
    once already, and the eval graded the Python one while production shipped the bug.
    """
    import json
    import subprocess

    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    proc = subprocess.run(
        ["npx", "tsx", os.path.join(repo, "scripts", "render-prompt.ts")],
        input=json.dumps({"id": prompt_id, "input": case_input, "template": template}),
        capture_output=True,
        text=True,
        cwd=repo,
        timeout=120,
    )
    if proc.returncode != 0:
        raise LLMCallError(f"render-prompt.ts failed for {prompt_id}: {proc.stderr.strip()}")
    return proc.stdout
