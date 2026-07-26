const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/opt/workspace'
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || `${WORKSPACE_ROOT}/projects`
const RUNTIME_ROOT = process.env.RUNTIME_ROOT || `${WORKSPACE_ROOT}/runtime`
const CLAUDE_STATE_ROOT = process.env.CLAUDE_STATE_ROOT || '/root/.claude'

export const WORKSPACE_PATHS = {
  workspaceRoot: WORKSPACE_ROOT,
  projectsRoot: PROJECTS_ROOT,
  runtimeRoot: RUNTIME_ROOT,
  claudeStateRoot: CLAUDE_STATE_ROOT,
  generalRoot: WORKSPACE_ROOT,
  commandRoot: `${PROJECTS_ROOT}/command`,
  mentorRoot: `${PROJECTS_ROOT}/career-os/mentor`,
  recruiterRoot: `${PROJECTS_ROOT}/career-os/recruiter`,
  contextRepoRoot: `${PROJECTS_ROOT}/context-repository`,
  skillfoundryRoot: `${PROJECTS_ROOT}/skillfoundry/skillfoundry-harness`,
  telemetryLog: `${RUNTIME_ROOT}/.telemetry/events.jsonl`,
  healthStatus: `${RUNTIME_ROOT}/.health-status.txt`,
  metaDir: `${RUNTIME_ROOT}/.meta`,
  symphonyTasks: `${RUNTIME_ROOT}/symphony/tasks.json`,
  envLocal: `${PROJECTS_ROOT}/command/.env.local`,
  sessionsConfig: `${WORKSPACE_ROOT}/supervisor/scripts/lib/sessions.conf`,
  supervisorStatus: `${WORKSPACE_ROOT}/supervisor/system/status.md`,
} as const
