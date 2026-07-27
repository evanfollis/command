import { createHash, timingSafeEqual } from 'node:crypto'
import { sign } from 'jsonwebtoken'
import { cookies } from 'next/headers'

import { verifyToken } from './jwt'
import { resolveJwtSecret } from './authKey'
import { COMMAND_JWT } from './authContract'

const COOKIE_NAME = 'command_token'

export function createToken(): string {
  return sign({ role: COMMAND_JWT.role }, resolveJwtSecret(), {
    algorithm: COMMAND_JWT.algorithm,
    issuer: COMMAND_JWT.issuer,
    audience: COMMAND_JWT.audience,
    expiresIn: '7d',
  })
}

export { verifyToken }

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}

function passwordDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function checkPassword(password: unknown): boolean {
  const expected = process.env.COMMAND_PASSWORD
  if (!expected || typeof password !== 'string') return false
  return timingSafeEqual(passwordDigest(password), passwordDigest(expected))
}

export { COOKIE_NAME }
