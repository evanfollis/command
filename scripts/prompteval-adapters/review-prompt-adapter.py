#!/usr/bin/env python3
"""prompteval `command` executor adapter for review-prompt.

stdin:  {"prompt_text": "<template>", "model": "...", "params": {}, "input": {...}}
stdout: the model's response

Renders via the SHIPPED TypeScript builder (scripts/render-prompt.ts) rather than
re-implementing substitution here. See adapter_llm.render_via_runtime.
"""
import json
import sys

from adapter_llm import print_result, render_via_runtime, run_prompt


def main() -> int:
    payload = json.load(sys.stdin)
    model = payload.get("model") or "claude-sonnet-4-6"
    rendered = render_via_runtime("review-prompt", payload["prompt_text"], payload["input"])
    return print_result(lambda: run_prompt(rendered, model, payload, "review-prompt"))


if __name__ == "__main__":
    sys.exit(main())
