#!/usr/bin/env python3
"""Regression for payload-free prompt-evaluation metadata inspection."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
READER = ROOT / "scripts" / "prompteval-safe-metadata.py"
SENTINELS = {
    "input": "SEALED_INPUT_MUST_NOT_RENDER",
    "output": "MODEL_OUTPUT_MUST_NOT_RENDER",
    "rubric": "PRIVATE_RUBRIC_MUST_NOT_RENDER",
    "detail": "JUDGE_DETAIL_MUST_NOT_RENDER",
    "reason": "GATE_REASON_MUST_NOT_RENDER",
    "telemetry": "PRIVATE_TELEMETRY_PATH_MUST_NOT_RENDER",
}

fixture = {
    "run_id": "run-safe-test",
    "ts": "2026-07-27T04:11:05Z",
    "prompt_id": "codex-task-prompt",
    "project": "command",
    "prompt_version": "pv-test",
    "spec_hash": "sh-test",
    "golden_hash": "gh-test",
    "model": "executor",
    "judge_model": "judge",
    "release": True,
    "trials": 1,
    "cached_allowed": False,
    "aggregate": 0.5,
    "required_aggregate": 0.5,
    "judge_unknown_ratio": 0.0,
    "cases": {
        "opaque-active": {
            "status": "active", "pass": True, "input": SENTINELS["input"],
            "output": SENTINELS["output"],
            "checks": [{"rubric": SENTINELS["rubric"], "detail": SENTINELS["detail"]}],
        },
        "opaque-holdout": {
            "status": "holdout", "pass": False, "input": SENTINELS["input"],
            "output": SENTINELS["output"],
            "checks": [{"rubric": SENTINELS["rubric"], "detail": SENTINELS["detail"]}],
        },
    },
    "gate": {"passed": False, "reasons": [SENTINELS["reason"]]},
    "provider_provenance": {
        "schema_version": "prompteval.provider-provenance.v1",
        "providers": ["anthropic"],
        "successful_calls": 2,
        "fallback_successes": 0,
        "telemetry_ref": SENTINELS["telemetry"],
    },
}

with tempfile.TemporaryDirectory(prefix="command-prompteval-metadata-") as directory:
    path = Path(directory) / "run.json"
    path.write_text(json.dumps(fixture))
    result = subprocess.run(
        [sys.executable, str(READER), str(path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    for sentinel in SENTINELS.values():
        assert sentinel not in result.stdout
        assert sentinel not in result.stderr
    summary = json.loads(result.stdout)

assert summary["schema_version"] == "command.prompteval-safe-metadata.v1"
assert summary["case_counts"] == {
    "active": {"failed": 0, "passed": 1, "total": 1},
    "holdout": {"failed": 1, "passed": 0, "total": 1},
}
assert summary["gate"] == {"passed": False, "reason_count": 1}
assert set(summary) == {
    "schema_version", "run_id", "ts", "prompt_id", "project",
    "prompt_version", "spec_hash", "golden_hash", "model", "judge_model",
    "release", "trials", "cached_allowed", "aggregate",
    "required_aggregate", "judge_unknown_ratio", "case_counts", "gate",
    "provider_provenance",
}
print("prompt-evaluation safe metadata reader passed")
