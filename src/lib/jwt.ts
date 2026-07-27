import { verify } from 'jsonwebtoken'

import { resolveJwtSecret } from './authKey'
import { COMMAND_JWT } from './authContract'

const COOKIE_NAME = 'command_token'

export function verifyToken(token: string): boolean {
  try {
    const payload = verify(token, resolveJwtSecret(), {
      algorithms: [COMMAND_JWT.algorithm],
      issuer: COMMAND_JWT.issuer,
      audience: COMMAND_JWT.audience,
    })
    return typeof payload !== 'string' && payload.role === COMMAND_JWT.role
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
