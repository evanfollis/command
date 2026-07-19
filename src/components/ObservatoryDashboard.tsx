import Link from 'next/link'
import { EvalTelemetryPanel } from '@/components/EvalTelemetryPanel'
import type { ObservatorySignal, ObservatorySnapshot, ObservatoryState } from '@/lib/observatory'

const stateStyle: Record<ObservatoryState, string> = {
  healthy: 'border-emerald-400/25 bg-emerald-400/8 text-emerald-200',
  degraded: 'border-amber-400/25 bg-amber-400/8 text-amber-200',
  blocked: 'border-rose-400/25 bg-rose-400/8 text-rose-200',
  unknown: 'border-slate-400/20 bg-slate-400/8 text-slate-300',
}

function StateBadge({ state }: { state: ObservatoryState }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${stateStyle[state]}`}>{state}</span>
}

function SignalCard({ item }: { item: ObservatorySignal }) {
  const details = Object.entries(item.details ?? {})
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3"><h3 className="font-medium text-neutral-100">{item.title}</h3><StateBadge state={item.state} /></div>
      <p className="mt-3 text-sm leading-6 text-neutral-400">{item.reason}</p>
      <dl className="mt-4 grid gap-2 text-xs text-neutral-500">
        <div><dt className="inline text-neutral-600">Observed </dt><dd className="inline">{new Date(item.observedAt).toLocaleString()}</dd></div>
        <div><dt className="inline text-neutral-600">Source </dt><dd className="inline break-all font-mono">{item.artifactHref ? <Link className="text-sky-300/80 hover:text-sky-200" href={item.artifactHref}>{item.sourceRef}</Link> : item.sourceRef}</dd></div>
      </dl>
      {details.length > 0 && <details className="mt-4 border-t border-white/5 pt-3 text-xs"><summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">Exact details</summary><dl className="mt-3 grid gap-2">{details.map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3"><dt className="break-words text-neutral-600">{key}</dt><dd className="break-words text-right font-mono text-neutral-400">{String(value ?? 'unknown')}</dd></div>)}</dl></details>}
    </article>
  )
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="rounded-[1.75rem] border border-white/10 bg-[rgba(9,14,22,0.78)] p-5 sm:p-6"><p className="text-[10px] uppercase tracking-[0.28em] text-sky-300/60">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{title}</h2><div className="mt-5">{children}</div></section>
}

export function ObservatoryDashboard({ snapshot }: { snapshot: ObservatorySnapshot }) {
  const projection = snapshot.publicProjection
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="overflow-hidden rounded-[2rem] border border-sky-400/15 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_45%),rgba(7,11,18,0.92)] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.32em] text-sky-300/65">Private owner projection</p><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">What changed, what is stuck, and where judgment matters.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">A bounded server-side view of the same knowledge system exposed publicly by Synaplex, enriched with private operational state.</p></div>
          <div className="min-w-64 rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-[0.22em] text-neutral-500">Overall posture</span><StateBadge state={snapshot.posture} /></div><p className="mt-3 text-sm text-neutral-300">{snapshot.postureReason}</p><p className="mt-3 text-xs text-neutral-600">Snapshot {new Date(snapshot.generatedAt).toLocaleString()}</p></div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1.95fr]">
        <Section eyebrow="Authority" title="Owner decision queue">
          {snapshot.ownerQueue.length ? <div className="grid gap-3"><SignalCard item={snapshot.ownerQueueState} />{snapshot.ownerQueue.map((item) => <SignalCard key={item.id} item={item} />)}</div> : <SignalCard item={snapshot.ownerQueueState} />}
        </Section>
        <Section eyebrow="Knowledge loop" title="Progress and epistemic state"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><SignalCard item={snapshot.knowledgeLoop} />{snapshot.knowledge.map((item) => <SignalCard key={item.id} item={item} />)}</div></Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_1.85fr]">
        <Section eyebrow="Closure" title="Is diagnosis becoming execution?"><div className="grid gap-3">{snapshot.closure.map((item) => <SignalCard key={item.id} item={item} />)}</div></Section>
        <Section eyebrow="Cycles" title="Current work and accountable owners"><div className="grid gap-3 sm:grid-cols-2">{snapshot.currentCycles.map((item) => <SignalCard key={item.id} item={item} />)}</div></Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section eyebrow="Runtime" title="Automation and front-door health"><div className="grid gap-3">{snapshot.automation.map((item) => <SignalCard key={item.id} item={item} />)}{snapshot.collectorErrors.map((error) => <SignalCard key={error.collector} item={{ id: error.collector, title: `${error.collector} collector`, state: 'unknown', observedAt: snapshot.generatedAt, expiresAt: snapshot.expiresAt, sourceRef: 'collector boundary', reason: error.reason }} />)}</div></Section>
        <Section eyebrow="Durability" title="Deployment and remote identity"><div className="grid gap-3">{snapshot.deployment.map((item) => <SignalCard key={item.id} item={item} />)}{snapshot.durability.map((item) => <SignalCard key={item.id} item={item} />)}</div></Section>
      </div>

      <Section eyebrow="Models" title="Prompt, eval, fallback, and reliability"><div className="grid gap-3 md:grid-cols-2">{snapshot.modelTelemetry.map((item) => <SignalCard key={item.id} item={item} />)}</div><div className="mt-4"><EvalTelemetryPanel summary={snapshot.evalSummary} /></div><p className="mt-4 text-xs leading-5 text-neutral-500">A run is displayed as evidence, not silently promoted to acceptance. Fresh release baselines remain governed by ADR-0039; absent token or cost provenance stays unknown.</p></Section>

      <Section eyebrow="Projection coherence" title="Public versus private state">
        <div className="grid gap-4 md:grid-cols-3"><SignalCard item={projection} /><SignalCard item={snapshot.publicCoherence} /><dl className="rounded-2xl border border-white/10 bg-black/15 p-5 text-sm"><div className="flex justify-between gap-4 border-b border-white/5 py-2"><dt className="text-neutral-500">Availability</dt><dd>{projection.availability}</dd></div><div className="flex justify-between gap-4 border-b border-white/5 py-2"><dt className="text-neutral-500">Contract</dt><dd className="font-mono">{projection.contractVersion ?? 'unknown'}</dd></div><div className="flex justify-between gap-4 border-b border-white/5 py-2"><dt className="text-neutral-500">Version</dt><dd className="font-mono">{projection.projectionVersion ?? 'unknown'}</dd></div><div className="py-2"><dt className="text-neutral-500">Declared digest</dt><dd className="mt-1 break-all font-mono text-xs">{projection.digest ?? 'not emitted'}</dd></div></dl></div>
      </Section>

      <Section eyebrow="Movement" title="Recent material changes"><div className="grid gap-3 md:grid-cols-2">{snapshot.recentChanges.length ? snapshot.recentChanges.map((item) => <SignalCard key={item.id} item={item} />) : <p className="text-sm text-neutral-400">No bounded project front-door changes were available.</p>}</div></Section>

      <aside className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between"><p>Full-fidelity evidence stays off the dashboard hot path and remains addressable through lineage and operator surfaces.</p><div className="flex flex-wrap gap-2"><Link className="rounded-full border border-white/10 px-3 py-2 hover:text-white" href="/lineage">Evidence lineage</Link><Link className="rounded-full border border-white/10 px-3 py-2 hover:text-white" href="/operator-tools">Operator tools</Link><Link className="rounded-full border border-white/10 px-3 py-2 hover:text-white" href="/artifacts">Raw artifacts</Link></div></aside>
    </div>
  )
}
