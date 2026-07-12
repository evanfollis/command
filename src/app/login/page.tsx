import LoginBeacon from './LoginBeacon'
import LoginForm from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams)?.error ? 'Invalid password' : ''

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <LoginBeacon kind={error ? 'login_page_after_error' : 'login_page_view'} />
      <LoginForm error={error} />
    </div>
  )
}
