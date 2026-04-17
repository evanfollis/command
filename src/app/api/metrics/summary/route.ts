import { existsSync, readFileSync } from 'fs'
import { NextResponse } from 'next/server'

import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WINDOWS = ['1h', '24h', '7d', '30d'] as const
type Window = typeof WINDOWS[number]

interface ProjectWindowMetrics {
  threads: number
  compute_ms: number
  compute_minutes: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

function loadWindow(window: Window): Record<string, ProjectWindowMetrics> {
  const path = `${WORKSPACE_PATHS.runtimeRoot}/.metrics/${window}.json`
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return raw.projects || {}
  } catch {
    return {}
  }
}

export async function GET() {
  const perWindow: Record<Window, Record<string, ProjectWindowMetrics>> = {
    '1h': loadWindow('1h'),
    '24h': loadWindow('24h'),
    '7d': loadWindow('7d'),
    '30d': loadWindow('30d'),
  }

  const projects = new Set<string>()
  for (const w of WINDOWS) {
    for (const p of Object.keys(perWindow[w])) projects.add(p)
  }

  const byProject: Record<string, Record<Window, ProjectWindowMetrics>> = {}
  for (const project of projects) {
    const row: Partial<Record<Window, ProjectWindowMetrics>> = {}
    for (const w of WINDOWS) {
      row[w] = perWindow[w][project] ?? {
        threads: 0,
        compute_ms: 0,
        compute_minutes: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      }
    }
    byProject[project] = row as Record<Window, ProjectWindowMetrics>
  }

  const generated_at = (() => {
    const latestPath = `${WORKSPACE_PATHS.runtimeRoot}/.metrics/LATEST.json`
    if (!existsSync(latestPath)) return null
    try {
      return JSON.parse(readFileSync(latestPath, 'utf-8')).generated_at ?? null
    } catch {
      return null
    }
  })()

  return NextResponse.json({ generated_at, windows: WINDOWS, projects: byProject })
}
