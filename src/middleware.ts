import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/client-report']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
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

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'command-jwt-secret-change-in-production'
    )
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', origin))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|ws/).*)'],
}
