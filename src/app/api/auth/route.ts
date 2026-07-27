import { NextRequest, NextResponse } from 'next/server'
import { createToken, checkPassword, COOKIE_NAME } from '@/lib/auth'
import {
  clearLoginFailures,
  loginGlobalThrottleStatus,
  loginClientKey,
  loginClientThrottleStatus,
  recordLoginFailure,
} from '@/lib/loginThrottle'
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
  const clientKey = loginClientKey(req.headers)
  const throttle = loginClientThrottleStatus(clientKey)
  if (!throttle.allowed) {
    recordTelemetry({
      project: 'command',
      source: 'command.api.auth',
      eventType: 'throttled',
      level: 'warn',
      sourceType: 'user',
    })
    return NextResponse.json(
      { error: 'Too many login attempts' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(throttle.retryAfterSeconds),
        },
      },
    )
  }

  const contentType = req.headers.get('content-type') || ''
  const isForm = contentType.includes('application/x-www-form-urlencoded')

  let password: unknown
  try {
    if (isForm) {
      const form = await req.formData()
      password = form.get('password')
    } else {
      const body: unknown = await req.json()
      password = body && typeof body === 'object'
        ? (body as Record<string, unknown>).password
        : undefined
    }
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 })
  }
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'Password must be a string' }, { status: 400 })
  }

  if (!checkPassword(password)) {
    const globalThrottle = loginGlobalThrottleStatus()
    if (!globalThrottle.allowed) {
      recordTelemetry({
        project: 'command',
        source: 'command.api.auth',
        eventType: 'throttled',
        level: 'warn',
        sourceType: 'user',
      })
      return NextResponse.json(
        { error: 'Too many login attempts' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(globalThrottle.retryAfterSeconds),
          },
        },
      )
    }
    // Only emit a failure event for non-empty passwords — empty submissions are
    // password-manager autofill races, not meaningful security events.
    if (password.trim().length > 0) {
      recordLoginFailure(clientKey)
      recordTelemetry({
        project: 'command',
        source: 'command.api.auth',
        eventType: 'auth.login_failed',
        level: 'warn',
        sourceType: 'user',
      })
    }
    if (isForm) return redirect('/login?error=1')
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  clearLoginFailures(clientKey)
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
