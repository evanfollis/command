import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { WORKSPACE_PATHS } from './workspacePaths'

export interface HealthData {
  uptime: string | null
  memoryPercent: number | null
  diskPercent: number | null
  containers: ContainerInfo[] | null
  tunnelActive: boolean | null
  lastCheck: string | null
  issues: string[]
  sha: string
}

export interface ContainerInfo {
  name: string
  status: string
  health: string
}

interface CommandResult {
  ok: boolean
  stdout: string
}

function runReadCommand(file: string, args: string[], acceptedStatuses: number[] = [0]): CommandResult {
  const result = spawnSync(file, args, {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return {
    ok: typeof result.status === 'number' && acceptedStatuses.includes(result.status),
    stdout: typeof result.stdout === 'string' ? result.stdout.trim() : '',
  }
}

function finitePercent(value: string): number | null {
  const parsed = Number.parseFloat(value.replace('%', ''))
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

// Baked into dist/.version at build time (see package.json). In dev mode
// no dist/.version exists, so we fall back to a fixed argv git read. Cache the
// result because the deployed SHA cannot change without a restart.
let cachedSha: string | null = null
function readSha(): string {
  if (cachedSha) return cachedSha
  const versionFile = join(process.cwd(), 'dist', '.version')
  if (existsSync(versionFile)) {
    try {
      cachedSha = readFileSync(versionFile, 'utf8').trim()
      return cachedSha
    } catch {
      // Fall through to the development checkout identity.
    }
  }
  const git = runReadCommand('/usr/bin/git', ['rev-parse', 'HEAD'])
  cachedSha = git.ok && git.stdout ? git.stdout : 'unknown'
  return cachedSha
}

export function getHealth(): HealthData {
  const issues: string[] = []

  const uptimeResult = runReadCommand('/usr/bin/uptime', ['-p'])
  const uptime = uptimeResult.ok && uptimeResult.stdout
    ? uptimeResult.stdout.replace(/^up\s+/, '')
    : null
  if (uptime === null) issues.push('uptime-unavailable')

  const memoryResult = runReadCommand('/usr/bin/free', ['-b'])
  const memoryFields = memoryResult.stdout.split('\n').find((line) => line.startsWith('Mem:'))?.trim().split(/\s+/)
  const memoryTotal = Number(memoryFields?.[1])
  const memoryUsed = Number(memoryFields?.[2])
  const memoryPercent = memoryResult.ok && Number.isFinite(memoryTotal) && memoryTotal > 0 && Number.isFinite(memoryUsed)
    ? Math.round((memoryUsed / memoryTotal) * 100)
    : null
  if (memoryPercent === null) issues.push('memory-unavailable')

  const diskResult = runReadCommand('/usr/bin/df', ['--output=pcent', '/'])
  const diskPercent = diskResult.ok
    ? finitePercent(diskResult.stdout.split('\n').at(-1) ?? '')
    : null
  if (diskPercent === null) issues.push('disk-unavailable')

  const tunnelResult = runReadCommand('/usr/bin/systemctl', ['is-active', 'cloudflared'], [0, 3])
  const tunnelActive = tunnelResult.ok && ['active', 'inactive', 'failed', 'activating', 'deactivating'].includes(tunnelResult.stdout)
    ? tunnelResult.stdout === 'active'
    : null
  if (tunnelActive === null) issues.push('tunnel-unavailable')

  const dockerResult = runReadCommand('/usr/bin/docker', ['ps', '-a', '--format', '{{.Names}}|{{.Status}}|{{.State}}'])
  const containers = dockerResult.ok
    ? dockerResult.stdout
      ? dockerResult.stdout.split('\n').map((line) => {
          const [name = '', status = '', health = ''] = line.split('|')
          return { name, status, health }
        })
      : []
    : null
  if (containers === null) issues.push('containers-unavailable')

  let lastCheck: string | null = null
  try {
    lastCheck = readFileSync(WORKSPACE_PATHS.healthStatus, 'utf8').trim() || null
  } catch {
    issues.push('health-status-unavailable')
  }

  return {
    uptime,
    memoryPercent,
    diskPercent,
    containers,
    tunnelActive,
    lastCheck,
    issues,
    sha: readSha(),
  }
}
