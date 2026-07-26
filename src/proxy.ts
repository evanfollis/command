import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose/jwt/verify'

import { resolveJwtSecret } from '@/lib/jwtSecret'

const PUBLIC_PATHS = ['/login', '/api/auth']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }

  // Static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Next may stream a notFound() boundary with status 200 after route rendering
  // has begun. Reject invalid artifact extensions before rendering so the raw
  // artifact contract remains an actual HTTP 404 across framework versions.
  if (pathname.startsWith('/artifacts/') && !pathname.endsWith('.md')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const token = req.cookies.get('command_token')?.value
  const origin = process.env.COMMAND_ORIGIN || 'http://localhost:3100'
  if (!token) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  // Resolve outside the verify try so a missing production secret fails loud
  // (500) rather than being swallowed into a redirect loop. In production the
  // secret is delivered at runtime via the systemd EnvironmentFile.
  const secret = new TextEncoder().encode(resolveJwtSecret())
  try {
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', origin))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|ws/).*)'],
}
