#!/usr/bin/env python3
"""prompteval `command` executor adapter for codex-task-prompt.

stdin:  {"prompt_text": "<template>", "model": "...", "params": {}, "input": {...}}
stdout: the model's response

Renders via the SHIPPED TypeScript builder (scripts/render-prompt.ts) rather than
re-implementing substitution here. See adapter_llm.render_via_runtime.
"""
import json
import sys
from pathlib import Path

# The release executor starts Python with -I -P. Admit only this reviewed
# adapter directory so its sibling support module remains importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from adapter_llm import print_result, render_via_runtime, run_prompt


def main() -> int:
    payload = json.load(sys.stdin)
    model = payload.get("model") or "claude-sonnet-4-6"
    rendered = render_via_runtime("codex-task-prompt", payload["prompt_text"], payload["input"])
    return print_result(lambda: run_prompt(rendered, model, payload, "codex-task-prompt"))


if __name__ == "__main__":
    sys.exit(main())
