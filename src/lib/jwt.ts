import { verify } from 'jsonwebtoken'

import { resolveJwtSecret } from './authKey'

const COOKIE_NAME = 'command_token'

export function verifyToken(token: string): boolean {
  try {
    verify(token, resolveJwtSecret())
    return true
  } catch {
    return false
  }
}

export function extractCookieToken(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawVal] = part.split('=')
    if (!rawKey) continue
    if (rawKey.trim() === COOKIE_NAME) {
      return rawVal.join('=').trim()
    }
  }
  return null
}
