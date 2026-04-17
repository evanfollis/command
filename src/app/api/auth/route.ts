import { NextRequest, NextResponse } from 'next/server'
import { createToken, checkPassword, COOKIE_NAME } from '@/lib/auth'
import { recordTelemetry } from '@/lib/telemetry'

function cookieHeader(token: string): string {
  const maxAge = 60 * 60 * 24 * 7
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  })
  if (setCookie) headers.append('Set-Cookie', setCookie)
  return new Response(null, { status: 303, headers })
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  const isForm = contentType.includes('application/x-www-form-urlencoded')

  let password: string
  if (isForm) {
    const form = await req.formData()
    password = String(form.get('password') || '')
  } else {
    const body = await req.json()
    password = body.password
  }

  if (!checkPassword(password)) {
    recordTelemetry({
      project: 'command',
      source: 'command.api.auth',
      eventType: 'auth.login_failed',
      level: 'warn',
      sourceType: 'user',
    })
    if (isForm) return redirect('/login?error=1')
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = createToken()
  recordTelemetry({
    project: 'command',
    source: 'command.api.auth',
    eventType: 'auth.login_succeeded',
    level: 'info',
    sourceType: 'user',
  })

  if (isForm) return redirect('/', cookieHeader(token))

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}

export async function DELETE() {
  recordTelemetry({
    project: 'command',
    source: 'command.api.auth',
    eventType: 'auth.logout',
    level: 'info',
    sourceType: 'user',
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
