'use client'

import { useEffect, useState } from 'react'

import Shell from '@/components/Shell'
import PageHeader from '@/components/PageHeader'

interface MetaObservation {
  id: string
  source: string
  project: string
  category: string
  summary: string
  evidence?: string
  createdAt: number
}

interface MetaPattern {
  key: string
  project: string
  category: string
  count: number
  latestSummary: string
  sampleEvidence: string[]
}

export default function MetaPage() {
  const [loading, setLoading] = useState(true)
  const [observations, setObservations] = useState<MetaObservation[]>([])
  const [patterns, setPatterns] = useState<MetaPattern[]>([])
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/meta')
      const data = await res.json()
      setObservations(data.observations || [])
      setPatterns(data.explanationCandidates || data.patterns || [])
      setPrompt(data.synthesisPrompt || '')
      setLoading(false)
    }
    load()
  }, [])

  return (
    <Shell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <PageHeader
          eyebrow="Learning"
          title="Turn recurring friction into better policy."
          description="This is the durable learning surface: repeated stuckness, surprising wins, and the patterns that should change how the system behaves next time."
        />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-4">
            <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <h2 className="text-sm font-medium text-neutral-200">Recurring Patterns</h2>
              </div>
              <div className="p-4 space-y-4">
                {loading && <p className="text-sm text-neutral-500">Loading patterns...</p>}
                {!loading && patterns.length === 0 && (
                  <p className="text-sm text-neutral-500">No recurring patterns yet.</p>
                )}
                {patterns.map((pattern) => (
                  <div key={pattern.key} className="border border-neutral-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-400">
                        {pattern.project}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-500">
                        {pattern.category}
                      </span>
                      <span className="text-xs text-neutral-500 ml-auto">{pattern.count} occurrences</span>
                    </div>
                    <p className="text-sm text-neutral-200">{pattern.latestSummary}</p>
                    {pattern.sampleEvidence.length > 0 && (
                      <div className="space-y-2">
                        {pattern.sampleEvidence.map((sample, index) => (
                          <pre
                            key={`${pattern.key}-${index}`}
                            className="text-xs text-neutral-400 whitespace-pre-wrap bg-surface-0 border border-neutral-800 rounded p-2"
                          >
                            {sample}
                          </pre>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <h2 className="text-sm font-medium text-neutral-200">Recent Observations</h2>
              </div>
              <div className="p-4 space-y-3 max-h-[45vh] overflow-y-auto">
                {loading && <p className="text-sm text-neutral-500">Loading observations...</p>}
                {!loading && observations.length === 0 && (
                  <p className="text-sm text-neutral-500">No observations recorded yet.</p>
                )}
                {observations.map((observation) => (
                  <div key={observation.id} className="border border-neutral-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-400">
                        {observation.project}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-neutral-700 text-neutral-500">
                        {observation.category}
                      </span>
                      <span className="text-xs text-neutral-600 ml-auto">
                        {new Date(observation.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200">{observation.summary}</p>
                    <p className="text-xs text-neutral-500 mt-1">{observation.source}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="bg-surface-1 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800">
                <h2 className="text-sm font-medium text-neutral-200">Offline Synthesis Prompt</h2>
              </div>
              <pre className="p-4 text-xs text-neutral-300 whitespace-pre-wrap overflow-x-auto max-h-[75vh] overflow-y-auto">
                {prompt || 'No recurring patterns yet.'}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  )
}
