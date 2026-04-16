import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildScopedShellEnv } from './environments'
import { recordReviewObservation } from './metaLearning'
import { sendKeys } from './tmux'
import { updateTask } from './taskStore'
import { WORKSPACE_PATHS } from './workspacePaths'

const PROJECT_PATHS: Record<string, string> = {
  mentor: WORKSPACE_PATHS.mentorRoot,
  skillfoundry: WORKSPACE_PATHS.skillfoundryRoot,
  recruiter: WORKSPACE_PATHS.recruiterRoot,
  'context-repo': WORKSPACE_PATHS.contextRepoRoot,
  general: WORKSPACE_PATHS.generalRoot,
  'executive-codex': WORKSPACE_PATHS.generalRoot,
  command: WORKSPACE_PATHS.commandRoot,
}

export function resolveProjectPath(session: string): string {
  return PROJECT_PATHS[session] || WORKSPACE_PATHS.generalRoot
}

export function gatherDiff(projectPath: string): string {
  try {
    return execSync(`cd ${projectPath} && git diff HEAD~3 --stat && echo "---" && git diff HEAD~3`, {
      encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024,
    }).slice(0, 8000)
  } catch {
    return '(no recent changes to review)'
  }
}

export function buildReviewPrompt(session: string, diff: string, focus?: string): string {
  const focusClause = focus ? `Pay special attention to: ${focus}.` : ''
  return `Adversarial review of recent changes in ${session}. Challenge the implementation — question design decisions, hidden assumptions, failure modes, race conditions, and alternative approaches. Do NOT look for formatting or style issues. Focus on: would this design survive production pressure? ${focusClause}

Recent changes:
${diff}`
}

/**
 * Run Codex review asynchronously. Pipes the prompt via stdin
 * to avoid shell argument length limits. Does NOT block the event loop.
 */
export function runCodexReview(projectPath: string, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    const proc: ChildProcessWithoutNullStreams = spawn('codex', ['exec', '-', '-s', 'read-only'], {
      cwd: projectPath,
      env: buildScopedShellEnv(process.env, 'review-sandbox'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', (data: Buffer) => chunks.push(data.toString()))
    proc.stderr.on('data', (data: Buffer) => chunks.push(data.toString()))

    proc.on('close', (code: number | null) => {
      resolve(chunks.join('') || `Codex exited with code ${code}`)
    })

    proc.on('error', (err: Error) => {
      resolve(`Codex error: ${err.message}`)
    })

    // Write prompt to stdin and close
    proc.stdin.write(prompt)
    proc.stdin.end()

    // Safety timeout — kill after 2 minutes
    setTimeout(() => {
      try { proc.kill() } catch {}
      resolve(chunks.join('') || 'Codex review timed out after 120s')
    }, 120000)
  })
}

/**
 * Send a review prompt to a Claude session via tmux.
 * Writes prompt to a temp file and tells Claude to read it — avoids
 * newline-as-Enter issues with paste-buffer.
 */
export function sendClaudeReview(reviewSession: string, prompt: string): boolean {
  const tmpFile = join(tmpdir(), `review-claude-${Date.now()}.txt`)
  try {
    writeFileSync(tmpFile, prompt, 'utf-8')
    return sendKeys(reviewSession, `Read ${tmpFile} and execute the adversarial review instructions within.`)
  } catch {
    return false
  }
  // Don't delete the file — Claude needs to read it. /tmp is cleaned by OS.
}

/**
 * Run a full adversarial review. Used by both the API route and auto-review.
 * Async — does not block the event loop during Codex execution.
 */
export async function executeReview(
  session: string,
  reviewer: 'codex' | 'claude',
  taskId?: string,
  focus?: string
): Promise<{ reviewer: string; review?: string; reviewSession?: string; error?: string }> {
  const projectPath = resolveProjectPath(session)
  const diff = gatherDiff(projectPath)
  const prompt = buildReviewPrompt(session, diff, focus)

  if (reviewer === 'codex') {
    const result = await runCodexReview(projectPath, prompt)
    if (taskId) {
      const task = updateTask(taskId, { reviewStatus: 'complete', reviewResult: result }, {
        type: 'review.completed',
        message: 'Adversarial review completed',
        details: { reviewer: 'codex' },
      })
      recordReviewObservation(task, result, 'codex')
    }
    return { reviewer: 'codex', review: result }
  } else {
    const reviewSession = session === 'general' ? 'mentor' : 'general'
    const ok = sendClaudeReview(reviewSession, prompt)
    if (!ok) {
      if (taskId) {
        updateTask(taskId, { reviewStatus: 'none' }, {
          type: 'review.failed',
          message: `Failed to send review to "${reviewSession}"`,
          details: { reviewer: 'claude', reviewSession },
        })
      }
      return { reviewer: 'claude', error: `Failed to send review to "${reviewSession}"` }
    }
    if (taskId) {
      updateTask(taskId, { reviewStatus: 'pending', reviewSession }, {
        type: 'review.pending',
        message: `Adversarial review sent to "${reviewSession}"`,
        details: { reviewer: 'claude', reviewSession },
      })
    }
    return { reviewer: 'claude', reviewSession }
  }
}
