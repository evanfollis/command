'use client'

export default function ObservatoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-12 sm:px-6"><div className="w-full rounded-[2rem] border border-rose-400/20 bg-rose-400/[0.04] p-8"><p className="text-[10px] uppercase tracking-[0.28em] text-rose-300/70">Owner projection unavailable</p><h1 className="mt-3 text-3xl font-semibold text-white">The observatory could not form a safe snapshot.</h1><p className="mt-4 text-sm leading-6 text-neutral-400">No private data was returned. Individual source failures normally remain isolated; this state means the route itself failed.</p><button type="button" onClick={reset} className="mt-6 rounded-full border border-rose-300/20 px-4 py-2 text-sm text-rose-100 hover:border-rose-300/40">Retry bounded collection</button></div></main>
}
