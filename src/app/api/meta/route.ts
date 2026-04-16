import { NextRequest, NextResponse } from 'next/server'

import {
  recordMetaObservation,
  synthesizeMetaFindings,
  type MetaObservationCategory,
} from '@/lib/metaLearning'

const ALLOWED_CATEGORIES: MetaObservationCategory[] = [
  'stuckness',
  'mistake',
  'surprise',
  'success',
  'design_pressure',
  'better_explanation',
  'manual',
]

export async function GET() {
  return NextResponse.json(synthesizeMetaFindings())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { source, project, category, summary, evidence, recurringKey, taskId, sessionId } = body

  if (!source || !project || !category || !summary) {
    return NextResponse.json({ error: 'source, project, category, and summary are required' }, { status: 400 })
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `Unsupported category: ${category}` }, { status: 400 })
  }

  const observation = recordMetaObservation({
    source,
    project,
    category,
    summary,
    evidence,
    recurringKey,
    taskId,
    sessionId,
  })

  return NextResponse.json({ observation })
}
