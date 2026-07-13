#!/usr/bin/env python3
"""prompteval `command` executor adapter for thread-opening-frame.

stdin:  {"prompt_text": "<frame text>", "model": "...", "params": {},
         "input": {"message": "<user message to the executive thread>"}}
stdout: the model's response

The adapter sends the frame as --append-system-prompt and the message as
the user turn, mirroring the real runClaudeTurn() path.
"""
import json
import sys

from adapter_llm import print_result, run_prompt_with_system


def main() -> int:
    payload = json.load(sys.stdin)
    prompt_text = payload["prompt_text"]
    model = payload.get("model") or "claude-sonnet-4-6"
    case_input = payload["input"]
    message = case_input.get("message", "")

    return print_result(
        lambda: run_prompt_with_system(
            prompt_text, message, model, payload, "thread-opening-frame"
        )
    )


if __name__ == "__main__":
    sys.exit(main())
