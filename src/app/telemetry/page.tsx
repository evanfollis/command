'use client'

import { useEffect, useState } from 'react'

import Shell from '@/components/Shell'
import PageHeader from '@/components/PageHeader'

interface TelemetryEvent {
  id: string
  timestamp: number
  project: string
  source: string
  eventType: string
  level: string
  details?: Record<string, unknown>
}

interface TelemetrySummary {
  total: number
  byProject: [string, number][]
  byType: [string, number][]
  byLevel: [string, number][]
  recent: TelemetryEvent[]
}

export default function TelemetryPage() {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/telemetry')
      const data = await res.json()
      setSummary(data)
    }
    load()
  }, [])

  return (
    <Shell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <PageHeader
          eyebrow="Signals"
          title="Read the control-plane signal, not the noise."
          description="Structured operational events make the workspace legible under load. This surface is for patterns, anomalies, and proof, not dashboard theater."
        />

        {!summary ? (
          <p className="text-sm text-neutral-500">Loading telemetry...</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard title="Events" rows={[[String(summary.total), 'recent structured events']]} />
              <SummaryCard title="Projects" rows={summary.byProject.slice(0, 5).map(([name, count]) => [String(count), name])} />
              <SummaryCard title="Levels" rows={summary.byLevel.map(([name, count]) => [String(count), name])} />
            </div>

            <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <h2 className="text-sm font-medium text-neutral-200">Event Types</h2>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {summary.byType.map(([name, count]) => (
                  <span key={name} className="text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-300">
                    {name} · {count}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <h2 className="text-sm font-medium text-neutral-200">Recent Events</h2>
              </div>
              <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
                {summary.recent.map((event) => (
                  <div key={event.id} className="border border-neutral-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-400">
                        {event.project}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-500">
                        {event.level}
                      </span>
                      <span className="text-xs text-neutral-600 ml-auto">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-200">{event.eventType}</div>
                    <div className="text-xs text-neutral-500 mt-1">{event.source}</div>
                    {event.details && (
                      <pre className="mt-2 text-xs text-neutral-400 whitespace-pre-wrap bg-surface-0 border border-neutral-800 rounded p-2">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

function SummaryCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
      </div>
      <div className="p-4 space-y-3">
        {rows.map(([value, label]) => (
          <div key={`${title}-${label}`} className="flex items-center justify-between gap-4">
            <span className="text-lg font-semibold text-neutral-100">{value}</span>
            <span className="text-xs text-neutral-500 text-right">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
