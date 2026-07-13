import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { WORKSPACE_PATHS } from './workspacePaths'

const CAPTURE_DIR = join(WORKSPACE_PATHS.runtimeRoot, 'prompteval', 'command', 'capture')

let _captureDirEnsured = false
function ensureCaptureDir() {
  if (!_captureDirEnsured) {
    mkdirSync(CAPTURE_DIR, { recursive: true })
    _captureDirEnsured = true
  }
}

export function capturePromptInput(builder: string, inputFields: Record<string, unknown>): void {
  // Eval renders go through the same builders; capturing them would feed synthetic
  // golden inputs back in as `production` provenance and corrupt the flywheel.
  if (process.env.PROMPTEVAL_RENDER) return
  try {
    ensureCaptureDir()
    const entry = JSON.stringify({
      builder,
      input: inputFields,
      ts: Date.now(),
      sourceType: 'system',
    }) + '\n'
    appendFileSync(join(CAPTURE_DIR, `${builder}.jsonl`), entry)
  } catch (err: unknown) {
    // Reset the "dir ensured" flag if the dir has gone away, so the next call retries.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') _captureDirEnsured = false
    // fire-and-forget — never let capture failures affect the caller
  }
}
