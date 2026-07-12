import Link from 'next/link'
import Shell from '@/components/Shell'

const tools = [
  { href: '/attach/general', title: 'Executive recovery attach', reason: 'Authenticated live session recovery.' },
  { href: '/symphony', title: 'Symphony task control', reason: 'Legacy orchestration and transition controls.' },
  { href: '/artifacts', title: 'Raw artifact browser', reason: 'Addressable drill-down outside the dashboard hot path.' },
]

export default function OperatorToolsPage() {
  return <Shell><div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><p className="text-[10px] uppercase tracking-[0.28em] text-sky-300/60">Secondary surface</p><h1 className="mt-2 text-3xl font-semibold text-white">Operator tools</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">Recovery and host-adjacent capabilities retained outside the owner observatory. Access remains behind Command authentication and route-level capability checks.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{tools.map((tool) => <Link key={tool.href} href={tool.href} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 hover:border-sky-400/25"><h2 className="font-medium text-white">{tool.title}</h2><p className="mt-2 text-sm text-neutral-500">{tool.reason}</p></Link>)}</div></div></Shell>
}
