import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { WORKSPACE_PATHS } from './workspacePaths'

export interface HealthData {
  uptime: string
  memoryPercent: number
  diskPercent: number
  containers: ContainerInfo[]
  tunnelActive: boolean
  lastCheck: string
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
  }
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 })
  } catch {
    return ''
  }
}
