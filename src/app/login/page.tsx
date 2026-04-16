import LoginBeacon from './LoginBeacon'
import { COMMAND_IDENTITY } from '@/lib/command-product'

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams?.error ? 'Invalid password' : ''

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <LoginBeacon kind={error ? 'login_page_after_error' : 'login_page_view'} />
      <form method="POST" action="/api/auth" className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{COMMAND_IDENTITY.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{COMMAND_IDENTITY.title}</p>
        </div>

        <div>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            required
            className="w-full px-4 py-3 bg-surface-2 border border-neutral-700 rounded-lg
                       text-neutral-200 placeholder-neutral-500
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {error && (
          <p className="text-err text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          className="w-full py-3 bg-accent hover:bg-blue-600 disabled:opacity-40
                     rounded-lg font-medium transition-colors"
        >
          Enter
        </button>
      </form>
    </div>
  )
}
