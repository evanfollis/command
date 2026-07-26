import { capturePromptInput } from './promptCapture'
import { fillTemplate, loadPrompt } from './promptTemplate'

/**
 * Render the historical review prompt for its governed eval loop.
 *
 * Review dispatch belongs to the Codex and Claude applications. This builder
 * deliberately has no process, filesystem-write, tmux, or task-store imports.
 */
export function buildReviewPrompt(session: string, diff: string, focus?: string): string {
  capturePromptInput('review-prompt', { session, focus: focus ?? null, diff })
  const focusClause = focus ? ` Pay special attention to: ${focus}.` : ''
  return fillTemplate(loadPrompt('review-prompt'), {
    session,
    focus_clause: focusClause,
    diff,
  })
}
