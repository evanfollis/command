import { NextResponse } from 'next/server'
import { listSymphonyTasks } from '@/lib/symphonyStore'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const tasks = listSymphonyTasks()
  return NextResponse.json({ tasks })
}
