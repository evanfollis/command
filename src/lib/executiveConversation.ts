import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { tmpdir } from 'os'

import { WORKSPACE_PATHS } from './workspacePaths'

export interface ExecutiveMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ExecutiveConversationState {
  messages: ExecutiveMessage[]
}

const STORE_PATH = `${WORKSPACE_PATHS.runtimeRoot}/.command-runtime/executive-thread.json`
const MAX_MESSAGES = 24

function ensureStoreDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true })
}

function loadState(): ExecutiveConversationState {
  ensureStoreDir()
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as ExecutiveConversationState
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    }
  } catch {
    return { messages: [] }
  }
}

function saveState(state: ExecutiveConversationState) {
  ensureStoreDir()
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2))
}

export function getExecutiveConversation(): ExecutiveMessage[] {
  return loadState().messages
}

export function appendExecutiveMessage(message: ExecutiveMessage) {
  const state = loadState()
  state.messages.push(message)
  state.messages = state.messages.slice(-MAX_MESSAGES)
  saveState(state)
}

function buildPrompt(userMessage: string, history: ExecutiveMessage[]): string {
  const transcript = history
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n')

  return [
    'You are the principal-facing executive agent for the Synaplex workspace.',
    'Operate from /opt/workspace with full authority, but prefer delegation and shaping over direct low-level implementation unless direct intervention is the highest-leverage move.',
    'Interpret the principal at the right abstraction level. Push back when necessary. Preserve the latent architecture of the system.',
    'Be concise, direct, and useful. Answer as the executive, not as a generic assistant.',
    '',
    transcript ? 'Recent executive conversation:\n' + transcript : 'Recent executive conversation: (none)',
    '',
    `USER: ${userMessage}`,
    '',
    'Respond to the user directly.',
  ].join('\n')
}

export function runExecutiveTurn(userMessage: string): string {
  const history = getExecutiveConversation()
  const prompt = buildPrompt(userMessage, history)
  const outputFile = `${tmpdir()}/executive-response-${Date.now()}.txt`

  const stdout = execFileSync(
    'codex',
    [
      'exec',
      '-C',
      WORKSPACE_PATHS.workspaceRoot,
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--output-last-message',
      outputFile,
      '-',
    ],
    {
      encoding: 'utf-8',
      input: prompt,
      timeout: 240000,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
    }
  )

  let response = ''
  try {
    response = readFileSync(outputFile, 'utf-8').trim()
  } catch {
    response = stdout.trim()
  }

  if (!response) {
    response = 'No executive response was produced.'
  }

  const now = Date.now()
  appendExecutiveMessage({ role: 'user', content: userMessage, timestamp: now })
  appendExecutiveMessage({ role: 'assistant', content: response, timestamp: now + 1 })

  return response
}
