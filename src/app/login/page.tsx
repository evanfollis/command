import LoginForm from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams)?.error ? 'Invalid password' : ''

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <LoginForm error={error} />
    </div>
  )
}
