'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { COMMAND_IDENTITY, COMMAND_NAV, isActiveNavItem } from '@/lib/command-product'

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(8,12,18,0.7)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="shrink-0 rounded-2xl border border-sky-400/20 bg-[rgba(7,13,20,0.78)] px-3 py-2 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
          >
            <div className="text-[10px] uppercase tracking-[0.28em] text-sky-300/70">
              {COMMAND_IDENTITY.name}
            </div>
            <div className="text-sm font-semibold tracking-tight text-neutral-100">
              {COMMAND_IDENTITY.title}
            </div>
          </Link>

          <div className="hidden lg:block text-xs text-neutral-500 max-w-xs">
            {COMMAND_IDENTITY.description}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {COMMAND_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-full text-sm border ${
                isActiveNavItem(pathname, href)
                  ? 'border-sky-400/30 bg-sky-400/10 text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.12)]'
                  : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-200 hover:bg-white/5'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <button
          onClick={handleLogout}
          className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-sm text-neutral-500 hover:border-white/20 hover:text-neutral-300"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
