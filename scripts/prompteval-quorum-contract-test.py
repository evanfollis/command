#!/usr/bin/env python3
"""Command's release-eval judge quorum contract."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


if not __debug__:
    raise SystemExit("prompteval quorum contract requires assertions enabled")

ROOT = Path(__file__).resolve().parents[1]
HARNESS_REVISION = "8a0c0e329d67f6be2cd248acf028406fb53927b7"
HARNESS_TREE = "7ddfbbd2de03ee419272bedcf0089321ecd3ac86"
HARNESS_ENTRY_BLOB = "5606220807dc51c6c84be92afe7f2de3c3acc302"
HARNESS_REPO = Path(
    os.environ.get("PROMPTEVAL_HARNESS_REPO", "/opt/workspace/supervisor")
).resolve()
HARNESS_TEMP = TemporaryDirectory(prefix="command-reviewed-harness-")
HARNESS_ROOT = Path(HARNESS_TEMP.name)
subprocess.run(
    [
        sys.executable,
        "-I",
        "-P",
        str(ROOT / "scripts/prompteval_harness.py"),
        str(HARNESS_REPO),
        str(HARNESS_ROOT),
        HARNESS_REVISION,
        HARNESS_TREE,
        HARNESS_ENTRY_BLOB,
    ],
    check=True,
)
HARNESS_LIB = HARNESS_ROOT / "scripts/lib"
sys.path.insert(0, str(HARNESS_LIB))

from prompteval.grading import GradingError, run_judge_check  # noqa: E402
from prompteval.llm import provider_for_model  # noqa: E402
from prompteval.runner import RunError, run_eval  # noqa: E402

sys.path.insert(0, str(ROOT / "scripts"))
from prompteval_release_contract import validate_release  # noqa: E402
from prompteval_source_receipt import write_source_receipt  # noqa: E402
from prompteval_toolchain_contract import Tool, file_sha256, verify_toolchain  # noqa: E402


spec = json.loads(
    (ROOT / ".prompteval/codex-task-prompt/spec.json").read_text(encoding="utf-8")
)
judge_trials = spec["judge"]["trials"]
gate = spec["gate"]

assert judge_trials == 3
assert gate["trials"] == 1
assert gate["max_unknown_ratio"] == 0.0
assert provider_for_model(spec["judge"]["model"]) == "claude"
assert provider_for_model(spec["model"]) == "claude"
assert spec["executor"]["argv"] == [
    "python3",
    "-B",
    "-I",
    "-P",
    "scripts/prompteval-adapters/codex-task-prompt-adapter.py",
]

with TemporaryDirectory(prefix="command-toolchain-contract-") as directory:
    tool_root = Path(directory)
    pinned_bin = tool_root / "pinned-bin"
    poison_bin = tool_root / "poison-bin"
    pinned_bin.mkdir()
    poison_bin.mkdir()
    tools = []
    for name in ("python3", "claude", "node", "npx"):
        entry_path = pinned_bin / name
        entry_path.write_bytes(f"reviewed-{name}\n".encode())
        entry_path.chmod(0o700)
        tools.append(
            Tool(
                name=name,
                entry_path=entry_path,
                sha256=file_sha256(entry_path),
            )
        )
    assert verify_toolchain(str(pinned_bin), tuple(tools)) == []

    poison_claude = poison_bin / "claude"
    poison_claude.write_bytes(b"shadowed-claude\n")
    poison_claude.chmod(0o700)
    shadow_errors = verify_toolchain(
        f"{poison_bin}:{pinned_bin}",
        tuple(tools),
    )
    assert any("claude: resolved entry" in error for error in shadow_errors)

    poison_python = poison_bin / "python3"
    poison_python.write_bytes(b"shadowed-python\n")
    poison_python.chmod(0o700)
    python_shadow_errors = verify_toolchain(
        f"{poison_bin}:{pinned_bin}",
        tuple(tools),
    )
    assert any("python3: resolved entry" in error for error in python_shadow_errors)

    (pinned_bin / "node").write_bytes(b"mutated-node\n")
    mutation_errors = verify_toolchain(str(pinned_bin), tuple(tools))
    assert any("node: sha256" in error for error in mutation_errors)

judge_check = {
    "kind": "judge",
    "required": True,
    "failure_mode": "quorum-contract",
    "rubric": "PASS only for the contract fixture.",
}


def caller_for(verdicts: list[str]):
    remaining = iter(verdicts)
    calls = []

    def caller(_prompt: str, _model: str, telemetry_context=None) -> str:
        calls.append(telemetry_context)
        return json.dumps({"verdict": next(remaining), "reason": "fixture"})

    return caller, calls


vote_contracts = (
    (["pass", "pass", "fail"], "pass"),
    (["unknown", "unknown", "pass"], "unknown"),
    (["unknown", "pass", "pass"], "pass"),
    (["fail", "fail", "pass"], "fail"),
    (["pass", "fail", "fail"], "fail"),
    (["unknown", "unknown", "unknown"], "unknown"),
    (["pass", "fail", "unknown"], "unknown"),
)
for votes, expected in vote_contracts:
    caller, calls = caller_for(votes)
    verdict, _ = run_judge_check(
        judge_check,
        {"fixture": True},
        "fixture output",
        model="opus",
        trials=judge_trials,
        caller=caller,
    )
    assert verdict == expected, (votes, verdict, expected)
    assert len(calls) == 3

repair_responses = iter(
    [
        "unparseable fixture",
        '{"verdict":"pass","reason":"repaired fixture"}',
        '{"verdict":"pass","reason":"fixture"}',
        '{"verdict":"fail","reason":"fixture"}',
    ]
)
repair_calls = 0


def repair_caller(_prompt: str, _model: str, telemetry_context=None) -> str:
    global repair_calls
    repair_calls += 1
    return next(repair_responses)


verdict, _ = run_judge_check(
    judge_check,
    {"fixture": True},
    "fixture output",
    model="opus",
    trials=judge_trials,
    caller=repair_caller,
)
assert verdict == "pass"
assert repair_calls == 4

completed_calls = 0


def shortfall_caller(_prompt: str, _model: str, telemetry_context=None) -> str:
    global completed_calls
    completed_calls += 1
    if completed_calls == 1:
        return '{"verdict":"pass","reason":"fixture"}'
    raise GradingError("provider shortfall")


try:
    run_judge_check(
        judge_check,
        {"fixture": True},
        "fixture output",
        model="opus",
        trials=judge_trials,
        caller=shortfall_caller,
    )
except GradingError as error:
    assert str(error) == "provider shortfall"
else:
    raise AssertionError("provider shortfall must not become a judge vote")
assert completed_calls == 2


class ContractSpec:
    prompt_id = "codex-task-prompt"
    spec = spec

    def __init__(self, directory: Path):
        self.dir = directory
        self.baseline_path = directory / "baseline.json"

    def extract(self) -> str:
        return "fixture prompt"

    def version(self) -> str:
        return "fixture-version"

    def spec_hash(self) -> str:
        return "fixture-spec-hash"


advisory_case = {
    "id": "advisory-contract-case",
    "input": {"fixture": True},
    "checks": [judge_check, {**judge_check, "failure_mode": "second-check"}],
    "must_pass": False,
    "status": "active",
    "provenance": "synthetic",
}
seen_trials = []


def unavailable_judge(*_args, **kwargs):
    seen_trials.append(kwargs["trials"])
    raise GradingError("provider shortfall")


with TemporaryDirectory(prefix="command-quorum-contract-") as directory:
    runtime_root = Path(directory) / "runtime"
    contract_spec = ContractSpec(Path(directory) / "spec")
    with (
        patch("prompteval.runner.RUNTIME_ROOT", runtime_root),
        patch("prompteval.runner.runnable_cases", return_value=[advisory_case]),
        patch("prompteval.runner.cached_execute", return_value="fixture output"),
        patch("prompteval.runner.run_judge_check", side_effect=unavailable_judge),
        patch("prompteval.goldens.golden_hash", return_value="fixture-golden-hash"),
    ):
        report = run_eval(
            contract_spec,
            project="command",
            release=True,
            no_cache=True,
            storage_key="command-contract",
            log=lambda _message: None,
        )

assert seen_trials == [3, 3]
assert report["cases"]["advisory-contract-case"]["must_pass"] is False
assert report["cases"]["advisory-contract-case"]["pass"] is False
assert report["judge_unknown_ratio"] == 1.0
assert report["gate"]["passed"] is False
assert any(
    "judge unknown ratio" in reason for reason in report["gate"]["reasons"]
)

with TemporaryDirectory(prefix="command-executor-contract-") as directory:
    runtime_root = Path(directory) / "runtime"
    contract_spec = ContractSpec(Path(directory) / "spec")
    with (
        patch("prompteval.runner.RUNTIME_ROOT", runtime_root),
        patch("prompteval.runner.runnable_cases", return_value=[advisory_case]),
        patch(
            "prompteval.runner.cached_execute",
            side_effect=RunError("executor provider shortfall"),
        ),
        patch("prompteval.goldens.golden_hash", return_value="fixture-golden-hash"),
    ):
        try:
            run_eval(
                contract_spec,
                project="command",
                release=True,
                no_cache=True,
                storage_key="command-contract",
                log=lambda _message: None,
            )
        except RunError as error:
            assert str(error) == "executor provider shortfall"
        else:
            raise AssertionError("executor provider shortfall must abort the run")
    assert not list(runtime_root.rglob("*.json"))

with TemporaryDirectory(prefix="command-release-contract-") as directory:
    contract_root = Path(directory)
    contract_runtime = contract_root / "runtime"
    contract_dir = contract_root / ".prompteval/codex-task-prompt"
    contract_dir.mkdir(parents=True)
    (contract_dir / "spec.json").write_text(
        json.dumps(
            {
                "judge": {"model": "opus", "trials": 3},
                "gate": {"trials": 1, "max_unknown_ratio": 0},
            }
        ),
        encoding="utf-8",
    )
    valid_baseline = {
        "run_id": "run-contract",
        "prompt_version": "pv-contract",
        "spec_hash": "sh-contract",
        "golden_hash": "gh-contract",
        "release": True,
        "passed": True,
        "all_cases_passed": True,
        "accepted_from_cache": False,
        "judge_unknown_ratio": 0,
        "gate": {"passed": True},
        "cases": {f"case-{index}": {"pass": True} for index in range(18)},
        "provider_provenance": {
            "schema_version": "prompteval.provider-provenance.v1",
            "run_id": "run-contract",
            "providers": ["claude"],
            "successful_calls": 72,
            "fallback_successes": 0,
            "routes": [
                {
                    "role": "executor-adapter",
                    "provider": "claude",
                    "status": "success",
                    "calls": 18,
                },
                {
                    "role": "judge",
                    "provider": "claude",
                    "status": "success",
                    "calls": 54,
                },
            ],
        },
    }
    baseline_path = contract_dir / "baseline.json"
    attempt_path = contract_runtime / ".provenance/run-contract.jsonl"
    attempt_path.parent.mkdir(parents=True)
    attempts = []
    report_cases = {}
    for index in range(18):
        case_id = f"case-{index}"
        attempts.append(
            {
                "runId": "run-contract",
                "caseId": case_id,
                "provider": "claude",
                "role": "executor-adapter",
                "status": "success",
            }
        )
        attempts.extend(
            {
                "runId": "run-contract",
                "caseId": case_id,
                "provider": "claude",
                "role": "judge",
                "status": "success",
            }
            for _ in range(3)
        )
        report_cases[case_id] = {
            "pass": True,
            "trial_results": [
                {
                    "checks": [
                        {
                            "kind": "judge",
                            "verdict": "pass",
                            "required": True,
                        }
                    ]
                }
            ],
        }
    attempt_path.write_text(
        "\n".join(json.dumps(attempt) for attempt in attempts) + "\n",
        encoding="utf-8",
    )
    report_path = (
        contract_runtime
        / "command-contract/codex-task-prompt/runs/run-contract.json"
    )
    report_path.parent.mkdir(parents=True)
    valid_report = {
        "run_id": "run-contract",
        "release": True,
        "judge_unknown_ratio": 0,
        "gate": {"passed": True},
        "cases": report_cases,
        "provider_provenance": {"attempt_log": str(attempt_path)},
    }
    report_path.write_text(json.dumps(valid_report), encoding="utf-8")
    baseline_path.write_text(json.dumps(valid_baseline), encoding="utf-8")
    assert validate_release(
        contract_root,
        "codex-task-prompt",
        18,
        contract_runtime,
    ) == []
    binding_path = contract_root / "release-binding.json"
    assert validate_release(
        contract_root,
        "codex-task-prompt",
        18,
        contract_runtime,
        binding_path,
    ) == []
    receipt_path = contract_root / "source-revision.json"
    receipt = write_source_receipt(
        root=contract_root,
        prompt_id="codex-task-prompt",
        receipt_path=receipt_path,
        source_commit="a" * 40,
        source_tree="b" * 40,
        started_at="2026-07-27T00:00:00Z",
        profile="authoritative-claude-only",
        harness_revision=HARNESS_REVISION,
        harness_library_tree=HARNESS_TREE,
        harness_entry_blob="5606220807dc51c6c84be92afe7f2de3c3acc302",
        expected_cases=18,
        binding_path=binding_path,
    )
    binding = json.loads(binding_path.read_text(encoding="utf-8"))
    assert receipt["baseline_sha256"] == binding["baseline_sha256"]
    assert receipt["raw_report_sha256"] == binding["raw_report_sha256"]
    assert receipt["attempt_log_sha256"] == binding["attempt_log_sha256"]
    assert receipt["release_contract_status"] == "passed"
    missing_binding = contract_root / "missing-binding.json"
    try:
        write_source_receipt(
            root=contract_root,
            prompt_id="codex-task-prompt",
            receipt_path=contract_root / "missing-binding-receipt.json",
            source_commit="a" * 40,
            source_tree="b" * 40,
            started_at="2026-07-27T00:00:00Z",
            profile="authoritative-claude-only",
            harness_revision=HARNESS_REVISION,
            harness_library_tree=HARNESS_TREE,
            harness_entry_blob="5606220807dc51c6c84be92afe7f2de3c3acc302",
            expected_cases=18,
            binding_path=missing_binding,
        )
    except FileNotFoundError:
        pass
    else:
        raise AssertionError("authoritative receipt must reject a missing binding")

    mismatched_binding = json.loads(json.dumps(binding))
    mismatched_binding["run_id"] = "run-wrong"
    mismatched_binding_path = contract_root / "mismatched-binding.json"
    mismatched_binding_path.write_text(
        json.dumps(mismatched_binding),
        encoding="utf-8",
    )
    try:
        write_source_receipt(
            root=contract_root,
            prompt_id="codex-task-prompt",
            receipt_path=contract_root / "mismatched-binding-receipt.json",
            source_commit="a" * 40,
            source_tree="b" * 40,
            started_at="2026-07-27T00:00:00Z",
            profile="authoritative-claude-only",
            harness_revision=HARNESS_REVISION,
            harness_library_tree=HARNESS_TREE,
            harness_entry_blob="5606220807dc51c6c84be92afe7f2de3c3acc302",
            expected_cases=18,
            binding_path=mismatched_binding_path,
        )
    except ValueError as error:
        assert "run_id" in str(error)
    else:
        raise AssertionError("authoritative receipt must reject a mismatched binding")

    short_baseline = {**valid_baseline, "cases": {"case-1": {"pass": True}}}
    baseline_path.write_text(json.dumps(short_baseline), encoding="utf-8")
    assert any(
        "exactly 18 cases" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

    zero_judge = json.loads(json.dumps(valid_baseline))
    zero_judge["provider_provenance"]["routes"][1]["calls"] = 0
    zero_judge["provider_provenance"]["successful_calls"] = 18
    baseline_path.write_text(json.dumps(zero_judge), encoding="utf-8")
    assert any(
        "successful Claude judge calls" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

    baseline_path.write_text(json.dumps(valid_baseline), encoding="utf-8")
    incomplete_report = json.loads(json.dumps(valid_report))
    incomplete_report["cases"]["case-0"]["trial_results"][0]["checks"] = []
    report_path.write_text(json.dumps(incomplete_report), encoding="utf-8")
    assert any(
        "case case-0 has no judge coverage" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

    fallback_baseline = json.loads(json.dumps(valid_baseline))
    fallback_baseline["provider_provenance"]["fallback_successes"] = 1
    baseline_path.write_text(json.dumps(fallback_baseline), encoding="utf-8")
    report_path.write_text(json.dumps(valid_report), encoding="utf-8")
    rejected_binding = contract_root / "rejected-binding.json"
    assert any(
        "fallback-provider success" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
            rejected_binding,
        )
    )
    assert not rejected_binding.exists()

    baseline_path.write_text(json.dumps(valid_baseline), encoding="utf-8")
    unknown_report = json.loads(json.dumps(valid_report))
    unknown_report["cases"]["case-0"]["trial_results"][0]["checks"][0][
        "verdict"
    ] = "unknown"
    report_path.write_text(json.dumps(unknown_report), encoding="utf-8")
    assert any(
        "case case-0 has incomplete judge coverage" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

    report_path.write_text(json.dumps(valid_report), encoding="utf-8")
    non_claude_attempts = json.loads(json.dumps(attempts))
    non_claude_attempts[0]["provider"] = "codex"
    attempt_path.write_text(
        "\n".join(json.dumps(attempt) for attempt in non_claude_attempts) + "\n",
        encoding="utf-8",
    )
    assert any(
        "non-Claude successful call" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

    shortfall_attempts = [
        attempt
        for index, attempt in enumerate(attempts)
        if not (
            attempt["caseId"] == "case-0"
            and attempt["role"] == "judge"
            and index == 1
        )
    ]
    attempt_path.write_text(
        "\n".join(json.dumps(attempt) for attempt in shortfall_attempts) + "\n",
        encoding="utf-8",
    )
    assert any(
        "case case-0 lacks full Claude judge coverage" in error
        for error in validate_release(
            contract_root,
            "codex-task-prompt",
            18,
            contract_runtime,
        )
    )

print(
    "prompteval quorum contract passed "
    "(3 trials, 2 concordant votes required, zero unknowns)"
)
