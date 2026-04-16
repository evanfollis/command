'use client'

import { useEffect, useRef, useState } from 'react'
import Shell from '@/components/Shell'
import PageHeader from '@/components/PageHeader'

interface EnvironmentProfile {
  id: string
  label: string
  description: string
  trustClass: string
  capabilities: string[]
}

export default function TerminalPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const [environments, setEnvironments] = useState<EnvironmentProfile[]>([])
  const [environmentId, setEnvironmentId] = useState('workspace-observer')
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    let cancelled = false
    let term: any
    let fitAddon: any

    async function init() {
      const envRes = await fetch('/api/environments')
      const envData = await envRes.json()
      if (!cancelled) {
        setEnvironments(envData.environments || [])
      }

      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      term = new Terminal({
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#0a0a0a',
          foreground: '#e5e5e5',
          cursor: '#3b82f6',
          selectionBackground: '#3b82f644',
        },
        cursorBlink: true,
        allowProposedApi: true,
      })
      termRef.current = term

      fitAddon = new FitAddon()
      fitRef.current = fitAddon
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
      }

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/ws/terminal?environment=${encodeURIComponent(environmentId)}`)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        // Send initial size
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') {
            term.write(msg.data)
          }
        } catch {
          // raw data
          term.write(e.data)
        }
      }

      ws.onclose = () => setStatus('disconnected')
      ws.onerror = () => setStatus('disconnected')

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })
    }

    init()

    function handleResize() {
      fitRef.current?.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      wsRef.current?.close()
      termRef.current?.dispose()
    }
  }, [environmentId])

  function reconnect() {
    window.location.reload()
  }

  return (
    <Shell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Console"
          title="Use direct shell access deliberately."
          description="The executive surface should prefer delegation and explicit controls. The console stays available for operator-grade work that cannot be expressed more safely elsewhere."
        />
        <div className="flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[rgba(9,14,22,0.78)] shadow-[0_18px_40px_rgba(0,0,0,0.22)] h-[calc(100vh-14rem)]">
          <div className="flex items-center justify-between border-b border-neutral-800 bg-surface-1 px-4 py-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  status === 'connected' ? 'bg-ok' : status === 'connecting' ? 'bg-warn' : 'bg-err'
                }`} />
                <span className="text-xs text-neutral-500">
                  {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-500">
                <span>Environment</span>
                <select
                  value={environmentId}
                  onChange={(e) => setEnvironmentId(e.target.value)}
                  className="bg-surface-2 border border-neutral-700 rounded px-2 py-1 text-neutral-300"
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {status === 'disconnected' && (
              <button onClick={reconnect} className="text-xs text-accent hover:text-blue-400">
                Reconnect
              </button>
            )}
          </div>
          {environments.length > 0 && (
            <div className="px-4 py-2 border-b border-neutral-800 bg-surface-0 text-[11px] text-neutral-500">
              {environments.find((env) => env.id === environmentId)?.description}
            </div>
          )}
          <div ref={containerRef} className="flex-1 px-1 py-1" />
        </div>
      </div>
    </Shell>
  )
}
