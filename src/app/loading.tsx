export default function ObservatoryLoading() {
  return <main className="mx-auto max-w-7xl animate-pulse space-y-5 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading owner observatory"><div className="h-64 rounded-[2rem] border border-white/10 bg-white/[0.035]" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-80 rounded-[1.75rem] border border-white/10 bg-white/[0.025]" /><div className="h-80 rounded-[1.75rem] border border-white/10 bg-white/[0.025]" /></div><p className="sr-only">Collecting bounded owner signals.</p></main>
}
