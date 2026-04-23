import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface HealthData {
  uptime: string
  memoryPercent: number
  diskPercent: number
  containers: ContainerInfo[]
  tunnelActive: boolean
  lastCheck: string
  sha: string
}

// Baked into dist/.version at build time (see package.json). In dev mode
// no dist/.version exists, so we fall back to `git rev-parse HEAD` at
// runtime. Cache the result for the life of the process — the deployed
// SHA doesn't change without a restart.
let cachedSha: string | null = null
function readSha(): string {
  if (cachedSha) return cachedSha
  const versionFile = join(process.cwd(), 'dist', '.version')
  if (existsSync(versionFile)) {
    try {
      cachedSha = readFileSync(versionFile, 'utf-8').trim()
      return cachedSha
    } catch { /* fall through */ }
  }
  try {
    cachedSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', timeout: 2000 }).trim()
  } catch {
    cachedSha = 'unknown'
  }
  return cachedSha
}

export interface ContainerInfo {
  name: string
  status: string
  health: string
}

export function getHealth(): HealthData {
  const uptime = exec('uptime -p').replace('up ', '')
  const memLine = exec("free | awk '/Mem:/ {printf \"%.0f\", $3/$2*100}'")
  const diskLine = exec("df -h / | awk 'NR==2 {print $5}'").replace('%', '')
  const tunnelActive = exec('systemctl is-active cloudflared').trim() === 'active'

  let containers: ContainerInfo[] = []
  try {
    const raw = exec('docker ps -a --format "{{.Names}}|{{.Status}}|{{.State}}"')
    if (raw.trim()) {
      containers = raw.trim().split('\n').map((line) => {
        const [name, status, health] = line.split('|')
        return { name, status, health }
      })
    }
  } catch { /* no docker */ }

  let lastCheck = ''
  try {
    lastCheck = readFileSync(WORKSPACE_PATHS.healthStatus, 'utf-8').trim()
  } catch { /* no health file */ }

  return {
    uptime,
    memoryPercent: parseInt(memLine) || 0,
    diskPercent: parseInt(diskLine) || 0,
    containers,
    tunnelActive,
    lastCheck,
    sha: readSha(),
  }
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 })
  } catch {
    return ''
  }
}
