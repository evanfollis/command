import { sign } from 'jsonwebtoken'
import { cookies } from 'next/headers'

import { verifyToken } from './jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'command-jwt-secret-change-in-production'
const COOKIE_NAME = 'command_token'

export function createToken(): string {
  return sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' })
}

export { verifyToken }

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}

export function checkPassword(password: string): boolean {
  const expected = process.env.COMMAND_PASSWORD
  if (!expected) return false
  return password === expected
}

export { COOKIE_NAME }
