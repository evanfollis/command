import { isIP } from 'node:net'

const WINDOW_MS = 5 * 60 * 1000
const FAILURE_LIMIT = 8
const GLOBAL_FAILURE_LIMIT = 64
const MAX_CLIENTS = 1024
const UNKNOWN_CLIENT = 'unattributed'
const GLOBAL_CLIENT = '\0global'

interface FailureWindow {
  attempts: number[]
  lastSeen: number
}

const failures = new Map<string, FailureWindow>()

function prune(window: FailureWindow, now: number): void {
  const cutoff = now - WINDOW_MS
  while (window.attempts.length > 0 && window.attempts[0] <= cutoff) {
    window.attempts.shift()
  }
}

function evictOldestClient(): void {
  if (failures.size < MAX_CLIENTS) return
  let oldestKey: string | null = null
  let oldestSeen = Number.POSITIVE_INFINITY
  for (const [key, window] of failures) {
    if (window.lastSeen < oldestSeen) {
      oldestKey = key
      oldestSeen = window.lastSeen
    }
  }
  if (oldestKey) failures.delete(oldestKey)
}

export function loginClientKey(headers: Headers): string {
  // Cloudflare overwrites this header at the trusted tunnel boundary. Do not
  // accept X-Forwarded-For, which a direct client can supply or prepend.
  const candidate = headers.get('cf-connecting-ip')?.trim()
  return candidate && isIP(candidate) ? candidate : UNKNOWN_CLIENT
}

export function loginThrottleStatus(
  key: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const client = throttleWindowStatus(key, FAILURE_LIMIT, now)
  if (!client.allowed) return client
  return throttleWindowStatus(GLOBAL_CLIENT, GLOBAL_FAILURE_LIMIT, now)
}

function throttleWindowStatus(
  key: string,
  limit: number,
  now: number,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const window = failures.get(key)
  if (!window) return { allowed: true }
  prune(window, now)
  if (window.attempts.length === 0) {
    failures.delete(key)
    return { allowed: true }
  }
  window.lastSeen = now
  if (window.attempts.length < limit) return { allowed: true }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((window.attempts[0] + WINDOW_MS - now) / 1000),
    ),
  }
}

function recordFailureWindow(key: string, now: number): void {
  let window = failures.get(key)
  if (!window) {
    evictOldestClient()
    window = { attempts: [], lastSeen: now }
    failures.set(key, window)
  }
  prune(window, now)
  window.attempts.push(now)
  window.lastSeen = now
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  recordFailureWindow(key, now)
  recordFailureWindow(GLOBAL_CLIENT, now)
}

export function clearLoginFailures(key: string): void {
  failures.delete(key)
  failures.delete(GLOBAL_CLIENT)
}

export function resetLoginThrottleForTest(): void {
  failures.clear()
}
