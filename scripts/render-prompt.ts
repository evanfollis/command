#!/usr/bin/env tsx
/**
 * Render a governed prompt through the SHIPPED builder, for prompteval.
 *
 * stdin:  {"id": "<prompt-id>", "input": {...}, "template": "<candidate prompt text>"}
 * stdout: the exact string the runtime would hand to the model
 *
 * Why this exists: the adapters used to re-render templates in Python with re.sub(). That
 * is a *lookalike* of the runtime, not the runtime — and the two diverged. Production used
 * String.replace(str, str), which interprets `$&`, "$`", `$'` and `$$` in the replacement
 * value as patterns, so any diff containing shell reached the reviewer silently mangled.
 * The eval scored 1.0 throughout, because it never executed the buggy code. An eval that
 * grades a reimplementation cannot see bugs in the implementation.
 *
 * `template` (the candidate prompt prompteval is evaluating, which during optimization is
 * NOT what is on disk) is written to a temp dir and injected via COMMAND_PROMPT_DIR, so the
 * real loader and the real substitution run over it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

async function main() {
  const payload = JSON.parse(await new Promise<string>((res, rej) => {
    let buf = ''
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => res(buf))
    process.stdin.on('error', rej)
  }))

  const { id, input, template } = payload as {
    id: string
    input: Record<string, any>
    template?: string
  }

  // Point the real loader at the candidate template before importing the builders —
  // promptTemplate reads COMMAND_PROMPT_DIR at module init.
  let tmpDir: string | undefined
  if (typeof template === 'string') {
    tmpDir = mkdtempSync(join(tmpdir(), 'prompteval-'))
    writeFileSync(join(tmpDir, `${id}.md`), template, 'utf-8')
    process.env.COMMAND_PROMPT_DIR = tmpDir
  }
  process.env.PROMPTEVAL_RENDER = '1' // keep eval renders out of the capture flywheel

  let out: string
  try {
  switch (id) {
    case 'thread-opening-frame': {
      // Whole-file frame, no substitution: the runtime passes it verbatim as the system
      // prompt (--append-system-prompt). The user turn is the case's `message`.
      const { loadPrompt } = await import('../src/lib/promptTemplate')
      out = loadPrompt(id)
      break
    }
    case 'review-prompt': {
      const { buildReviewPrompt } = await import('../src/lib/review')
      out = buildReviewPrompt(input.session ?? 'unknown', input.diff ?? '(no diff)', input.focus || undefined)
      break
    }
    case 'codex-task-prompt': {
      const { buildCodexPrompt } = await import('../src/lib/executor')
      out = buildCodexPrompt({
        id: input.task_id,
        description: input.description ?? '',
        signals: {
          intent: input.intent || undefined,
          scope: input.scope || undefined,
          risk: input.risk || undefined,
          project: input.target_project || undefined,
        },
        decision: {
          model: String(input.model_posture ?? '').split('/')[0].trim() || 'sonnet',
          reasoning: String(input.model_posture ?? '').split('/')[1]?.trim() || 'default',
        },
      } as any)
      break
    }
    case 'offline-synthesis-prompt': {
      const { buildOfflineSynthesisPrompt } = await import('../src/lib/metaLearning')
      out = buildOfflineSynthesisPrompt(
        (input.patterns ?? []).map((p: any, i: number) => ({
          key: `${p.project}:${p.category}:${i}`,
          project: p.project,
          category: p.category,
          count: p.count,
          latestSummary: p.summary,
          sampleEvidence: p.evidence ?? [],
        }))
      )
      break
    }
    default:
      throw new Error(`render-prompt: unknown prompt id "${id}"`)
  }
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }

  process.stdout.write(out)
}

main().catch((e) => {
  console.error(`render-prompt failed: ${e?.message ?? e}`)
  process.exit(1)
})
