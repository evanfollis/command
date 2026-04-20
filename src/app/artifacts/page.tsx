import Link from 'next/link'
import Shell from '@/components/Shell'
import { listArtifacts, listSources } from '@/lib/artifacts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function formatRelative(mtime: number): string {
  const diff = Math.max(0, Date.now() - mtime)
  const seconds = Math.round(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}M`
  if (n >= 1024) return `${(n / 1024).toFixed(1)}k`
  return `${n}B`
}

export default function ArtifactsIndex() {
  const sources = listSources()

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-100">Artifacts</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Long-form research, syntheses, and scouting docs produced across the workspace. Read-only.
          </p>
        </header>

        <div className="space-y-6">
          {sources.map((source) => {
            const entries = listArtifacts(source.id) ?? []
            return (
              <section
                key={source.id}
                className="rounded-2xl border border-white/10 bg-[rgba(9,14,22,0.82)] p-5"
              >
                <div className="mb-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                    {source.label}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{source.description}</p>
                </div>

                {entries.length === 0 ? (
                  <p className="text-sm text-neutral-500">No artifacts in this source yet.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {entries.map((entry) => {
                      const href = `/artifacts/${source.id}/${entry.relativePath
                        .split('/')
                        .map((s) => encodeURIComponent(s))
                        .join('/')}`
                      return (
                        <li key={entry.relativePath}>
                          <Link
                            href={href}
                            className="flex flex-wrap items-baseline justify-between gap-3 px-1 py-2 text-sm hover:bg-white/[0.03]"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-neutral-100">
                              {entry.relativePath}
                            </span>
                            <span className="shrink-0 text-xs text-neutral-500">
                              {formatRelative(entry.mtime)} · {formatBytes(entry.sizeBytes)}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}
