'use client'

import { useEffect } from 'react'

/**
 * Fires a single beacon on mount so we can see what the browser resolved
 * to after an auth redirect. Closes the observability gap that made the
 * "redirected to localhost" mobile bug invisible to the server side.
 */
export default function LoginBeacon({ kind }: { kind: string }) {
  useEffect(() => {
    try {
      const nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type
      const body = JSON.stringify({
        kind,
        href: window.location.href,
        referrer: document.referrer,
        navType: nav || 'unknown',
      })
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-report', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/client-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
      }
    } catch { /* best-effort */ }
  }, [kind])
  return null
}
