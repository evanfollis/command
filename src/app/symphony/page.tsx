import Shell from '@/components/Shell'
import { listSymphonyTasks, type SymphonyState, type SymphonyTaskView } from '@/lib/symphonyStore'

export const dynamic = 'force-dynamic'

const STATE_COLORS: Record<SymphonyState, string> = {
  ready: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  running: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  blocked: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  review: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
  done: 'border-neutral-600 bg-neutral-800 text-neutral-300',
  deferred: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function TaskCard({ task }: { task: SymphonyTaskView }) {
  return (
    <article className={`rounded-2xl border ${task.stale ? 'border-amber-400/25' : 'border-white/10'} bg-white/[0.025] p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-neutral-100">{task.title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{task.targetProject} · {task.ownerSession} · changed {relativeTime(task.stateChangedAt)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${STATE_COLORS[task.state]}`}>
          {task.state}{task.stale ? ' · stale' : ''}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{task.description}</p>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-neutral-600">Task ID</dt><dd className="break-all font-mono text-neutral-400">{task.id}</dd></div>
        <div><dt className="text-neutral-600">Created</dt><dd className="text-neutral-400">{new Date(task.createdAt).toLocaleString()}</dd></div>
        {task.blockedBy && <div><dt className="text-neutral-600">Blocked by</dt><dd className="break-all font-mono text-amber-300">{task.blockedBy}</dd></div>}
        {task.reviewArtifacts?.length ? <div><dt className="text-neutral-600">Review artifacts</dt><dd className="break-words font-mono text-violet-300">{task.reviewArtifacts.join(', ')}</dd></div> : null}
      </dl>
      <details className="mt-4 border-t border-white/5 pt-3 text-xs">
        <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">Lifecycle history</summary>
        <ol className="mt-3 space-y-2">
          {task.stateHistory.map((entry, index) => (
            <li key={`${entry.timestamp}-${index}`} className="text-neutral-400">
              {entry.from ? `${entry.from} → ` : ''}<span className="text-neutral-200">{entry.to}</span> by {entry.by}
              {entry.reason ? ` — ${entry.reason}` : ''}
              <span className="ml-2 text-neutral-600">{new Date(entry.timestamp).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  )
}

export default function SymphonyClosurePage() {
  const tasks = listSymphonyTasks()
  const active = tasks.filter((task) => !['done', 'deferred'].includes(task.state))
  const closed = tasks.filter((task) => ['done', 'deferred'].includes(task.state))

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header>
          <p className="text-[10px] uppercase tracking-[0.28em] text-sky-300/60">Read-only lifecycle evidence</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-100">Symphony closure</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">Typed historical task state, ownership, blocks, and review lineage. Command does not create or transition work; autonomous producers own this store.</p>
        </header>
        <section className="mt-7">
          <h2 className="text-xs uppercase tracking-[0.22em] text-neutral-500">Open lifecycle records · {active.length}</h2>
          <div className="mt-3 grid gap-3">{active.length ? active.map((task) => <TaskCard key={task.id} task={task} />) : <p className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-neutral-500">No open lifecycle records.</p>}</div>
        </section>
        <details className="mt-7">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.22em] text-neutral-500 hover:text-neutral-300">Closed lifecycle records · {closed.length}</summary>
          <div className="mt-3 grid gap-3">{closed.map((task) => <TaskCard key={task.id} task={task} />)}</div>
        </details>
      </div>
    </Shell>
  )
}
