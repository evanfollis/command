import Link from 'next/link'
import Shell from '@/components/Shell'
import { WORKSPACE_PATHS } from '@/lib/workspacePaths'

export const dynamic = 'force-dynamic'

const sources = [
  { title: 'Cross-cutting syntheses', href: '/artifacts', source: `${WORKSPACE_PATHS.runtimeRoot}/.meta/cross-cutting-*.md`, note: 'Long-form diagnosis and proposal lineage.' },
  { title: 'Research artifacts', href: '/artifacts', source: `${WORKSPACE_PATHS.runtimeRoot}/research/`, note: 'Full research documents behind bounded knowledge summaries.' },
  { title: 'Eval run index', href: '/api/evals/summary', source: `${WORKSPACE_PATHS.runtimeRoot}/prompteval/`, note: 'Structured run identities and release verdicts; bulky per-case reports stay in the runtime tree.' },
  { title: 'Symphony lifecycle', href: '/symphony', source: WORKSPACE_PATHS.symphonyTasks, note: 'Typed task transitions, owners, review artifacts, and completion timestamps.' },
  { title: 'Live executive transcript', href: '/attach/general', source: 'tmux:general', note: 'Authenticated on-demand attach; transcript bulk is never loaded by the observatory.' },
  { title: 'Model and system telemetry', href: '/api/evals/summary', source: WORKSPACE_PATHS.telemetryLog, note: 'Append-only full-fidelity event lineage. The linked endpoint exposes only a bounded summary.' },
  { title: 'Remote durability receipts', href: '/', source: `${WORKSPACE_PATHS.runtimeRoot}/.telemetry/remote-durability.jsonl`, note: 'Per-repository publication identity and freshness receipts.' },
]

export default function LineagePage() {
  return <Shell><div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><header><p className="text-[10px] uppercase tracking-[0.28em] text-sky-300/60">Progressive disclosure</p><h1 className="mt-2 text-2xl font-semibold text-neutral-100">Evidence and transcript lineage</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">The owner dashboard reads bounded summaries. These authenticated links lead to the durable sources or their bounded indexes without pulling raw bulk into the render path.</p></header><div className="mt-6 grid gap-3 sm:grid-cols-2">{sources.map((item) => <Link key={item.title} href={item.href} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 hover:border-sky-300/20"><h2 className="font-medium text-neutral-100">{item.title}</h2><p className="mt-2 text-sm leading-6 text-neutral-400">{item.note}</p><p className="mt-3 break-all font-mono text-xs text-neutral-600">{item.source}</p></Link>)}</div></div></Shell>
}
