#!/usr/bin/env python3
"""Fail-closed postconditions for Command's authoritative release evaluation."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def validate_release(
    root: Path,
    prompt_id: str,
    expected_cases: int,
    runtime_root: Path,
    binding_path: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    spec_path = root / ".prompteval" / prompt_id / "spec.json"
    baseline_path = root / ".prompteval" / prompt_id / "baseline.json"
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"release evidence is unreadable: {error}"]

    judge = spec.get("judge") or {}
    gate = spec.get("gate") or {}
    if judge.get("trials") != 3:
        errors.append("judge.trials must equal 3")
    if gate.get("trials") != 1:
        errors.append("gate.trials must equal 1")
    if gate.get("max_unknown_ratio") != 0:
        errors.append("gate.max_unknown_ratio must equal 0")

    cases = baseline.get("cases")
    if not isinstance(cases, dict) or len(cases) != expected_cases:
        errors.append(f"release baseline must contain exactly {expected_cases} cases")
        cases = {}
    if not cases or any(result.get("pass") is not True for result in cases.values()):
        errors.append("every release case must pass, including advisory and holdout cases")
    if baseline.get("release") is not True:
        errors.append("baseline must come from a release run")
    if baseline.get("accepted_from_cache") is not False:
        errors.append("baseline must come from uncached execution")
    if baseline.get("passed") is not True or baseline.get("all_cases_passed") is not True:
        errors.append("baseline must record an all-case pass")
    if baseline.get("judge_unknown_ratio") != 0:
        errors.append("baseline must contain zero unknown judge checks")
    if (baseline.get("gate") or {}).get("passed") is not True:
        errors.append("baseline gate must pass")

    provenance = baseline.get("provider_provenance") or {}
    if provenance.get("schema_version") != "prompteval.provider-provenance.v1":
        errors.append("provider provenance schema is missing")
    if provenance.get("run_id") != baseline.get("run_id"):
        errors.append("provider provenance run does not match the baseline")
    if provenance.get("providers") != ["claude"]:
        errors.append("Claude must be the only successful release-eval provider")
    if provenance.get("fallback_successes") != 0:
        errors.append("release eval must not accept a fallback-provider success")

    routes = provenance.get("routes")
    if not isinstance(routes, list):
        errors.append("provider provenance routes are missing")
        routes = []
    claude_executor_success = sum(
        route.get("calls", 0)
        for route in routes
        if route.get("role") == "executor-adapter"
        and route.get("provider") == "claude"
        and route.get("status") == "success"
    )
    claude_judge_success = sum(
        route.get("calls", 0)
        for route in routes
        if route.get("role") == "judge"
        and route.get("provider") == "claude"
        and route.get("status") == "success"
    )
    non_claude_success = [
        route
        for route in routes
        if route.get("status") == "success" and route.get("provider") != "claude"
    ]
    if claude_executor_success < expected_cases:
        errors.append("every release case must have a successful Claude executor call")
    if claude_judge_success <= 0:
        errors.append("release evidence must contain successful Claude judge calls")
    if non_claude_success:
        errors.append("non-Claude successful provider routes are forbidden")
    if provenance.get("successful_calls") != (
        claude_executor_success + claude_judge_success
    ):
        errors.append("successful-call aggregate does not match accepted Claude routes")

    run_id = baseline.get("run_id")
    report_paths = (
        list(runtime_root.glob(f"*/{prompt_id}/runs/{run_id}.json"))
        if isinstance(run_id, str)
        else []
    )
    if len(report_paths) != 1:
        errors.append("exactly one raw report must exist for the accepted run")
        return errors
    try:
        report_path = report_paths[0].resolve(strict=True)
        report_path.relative_to(runtime_root.resolve())
        if report_path.stat().st_size > 2_000_000:
            raise ValueError("raw report exceeds two million bytes")
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        errors.append(f"raw release report is invalid: {error}")
        return errors
    if report.get("run_id") != run_id or report.get("release") is not True:
        errors.append("raw report identity does not match the release baseline")
    if report.get("judge_unknown_ratio") != 0:
        errors.append("raw report contains unknown judge checks")
    if (report.get("gate") or {}).get("passed") is not True:
        errors.append("raw report gate did not pass")

    report_cases = report.get("cases")
    if not isinstance(report_cases, dict) or len(report_cases) != expected_cases:
        errors.append(f"raw report must contain exactly {expected_cases} cases")
        report_cases = {}
    required_judges: dict[str, int] = {}
    for case_id, result in report_cases.items():
        if result.get("pass") is not True:
            errors.append(f"raw report case {case_id} did not pass")
        trial_results = result.get("trial_results")
        if not isinstance(trial_results, list) or len(trial_results) != gate.get("trials"):
            errors.append(f"raw report case {case_id} has incomplete execution trials")
            continue
        judge_checks = [
            check
            for trial_result in trial_results
            for check in trial_result.get("checks", [])
            if check.get("kind") == "judge"
        ]
        if not judge_checks:
            errors.append(f"raw report case {case_id} has no judge coverage")
            continue
        if any(check.get("verdict") in ("unknown", "skipped") for check in judge_checks):
            errors.append(f"raw report case {case_id} has incomplete judge coverage")
        required_judges[case_id] = len(judge_checks) * judge.get("trials", 0)

    attempt_log = (report.get("provider_provenance") or {}).get("attempt_log")
    provenance_root = (runtime_root / ".provenance").resolve()
    try:
        attempt_path = Path(attempt_log).resolve(strict=True)
        attempt_path.relative_to(provenance_root)
        if attempt_path.name != f"{run_id}.jsonl":
            raise ValueError("attempt log name does not match run")
        if attempt_path.stat().st_size > 2_000_000:
            raise ValueError("attempt log exceeds two million bytes")
    except (OSError, TypeError, ValueError) as error:
        errors.append(f"attempt log provenance is invalid: {error}")
        return errors

    successful_executors: dict[str, int] = {}
    successful_judges: dict[str, int] = {}
    try:
        for line in attempt_path.read_text(encoding="utf-8").splitlines():
            event = json.loads(line)
            if event.get("runId") != run_id or event.get("status") != "success":
                continue
            if event.get("provider") != "claude":
                errors.append("attempt log contains a non-Claude successful call")
                continue
            case_id = event.get("caseId")
            if event.get("role") == "executor-adapter":
                successful_executors[case_id] = successful_executors.get(case_id, 0) + 1
            elif event.get("role") == "judge":
                successful_judges[case_id] = successful_judges.get(case_id, 0) + 1
    except (OSError, json.JSONDecodeError, TypeError) as error:
        errors.append(f"attempt log is invalid: {error}")
        return errors

    for case_id, required in required_judges.items():
        if successful_executors.get(case_id, 0) < gate.get("trials", 0):
            errors.append(f"case {case_id} lacks a successful Claude executor trial")
        if successful_judges.get(case_id, 0) < required:
            errors.append(
                f"case {case_id} lacks full Claude judge coverage "
                f"({successful_judges.get(case_id, 0)} < {required})"
            )

    if not errors and binding_path is not None:
        binding = {
            "schema_version": "command.prompteval-release-binding.v1",
            "status": "passed",
            "run_id": run_id,
            "baseline_sha256": hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
            "raw_report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
            "attempt_log_sha256": hashlib.sha256(attempt_path.read_bytes()).hexdigest(),
        }
        binding_path.write_text(json.dumps(binding, indent=2) + "\n", encoding="utf-8")
        binding_path.chmod(0o600)

    return errors


def main() -> int:
    if len(sys.argv) != 6:
        print(
            "usage: prompteval_release_contract.py "
            "ROOT PROMPT_ID EXPECTED_CASES RUNTIME_ROOT BINDING_PATH",
            file=sys.stderr,
        )
        return 2
    errors = validate_release(
        Path(sys.argv[1]),
        sys.argv[2],
        int(sys.argv[3]),
        Path(sys.argv[4]),
        Path(sys.argv[5]),
    )
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"release eval contract passed ({sys.argv[3]} all-green cases, Claude only)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
