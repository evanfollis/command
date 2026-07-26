import { capturePromptInput } from './promptCapture'
import { fillTemplate, loadPrompt } from './promptTemplate'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface CodexTaskPromptInput {
  id: string
  description: string
  signals: {
    description?: string
    intent?: string
    scope?: string
    risk?: string
    project?: string
  }
  decision: {
    model: string
    reasoning: string
  }
  overrides?: {
    model?: string
    reasoning?: string
  }
}

const PROJECT_PATHS: Record<string, string> = {
  mentor: WORKSPACE_PATHS.mentorRoot,
  skillfoundry: WORKSPACE_PATHS.skillfoundryRoot,
  recruiter: WORKSPACE_PATHS.recruiterRoot,
  'context-repository': WORKSPACE_PATHS.contextRepoRoot,
  'context-repo': WORKSPACE_PATHS.contextRepoRoot,
  command: WORKSPACE_PATHS.commandRoot,
}

function resolveProjectPath(project?: string): string {
  if (project && PROJECT_PATHS[project]) return PROJECT_PATHS[project]
  return WORKSPACE_PATHS.generalRoot
}

/**
 * Render the historical Codex task prompt for its governed eval loop.
 *
 * Command no longer dispatches tasks. Keeping only this pure builder preserves
 * prompt/eval lineage without retaining tmux, process, credential, or task-store
 * mutation capabilities in the observatory package.
 */
export function buildCodexPrompt(task: CodexTaskPromptInput): string {
  const projectPath = resolveProjectPath(task.signals.project)
  const model = task.overrides?.model ?? task.decision.model
  const reasoning = task.overrides?.reasoning ?? task.decision.reasoning
  const intent = task.signals.intent || 'unknown'
  const scope = task.signals.scope || 'unknown'
  const risk = task.signals.risk || 'low'
  const modelPosture = `${model} / ${reasoning}`
  const targetProjectLine = task.signals.project ? `Target project: ${task.signals.project}\n` : ''
  capturePromptInput('codex-task-prompt', { intent, scope, risk, project: task.signals.project ?? null })
  return fillTemplate(loadPrompt('codex-task-prompt'), {
    task_id: task.id,
    project_path: projectPath,
    intent,
    scope,
    risk,
    model_posture: modelPosture,
    target_project_line: targetProjectLine,
    description: task.description,
  })
}
