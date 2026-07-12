#!/usr/bin/env tsx
/**
 * Browser-layer smoke for Command.
 *
 * Exercises routes server-side smoke cannot verify: real form auth,
 * client-side rendering, WebSocket attach streams (snapshot delivery),
 * owner-observatory rendering at desktop and mobile viewports.
 *
 * Kept separate from scripts/smoke.ts — preserves evidence-class distinction
 * between server-side (HTTP + WS) and browser-layer (Chromium rendering + UI).
 *
 * Invoked via `npm run browser:smoke` which calls browser-smoke-wrapper.sh.
 * The wrapper sets PLAYWRIGHT_BROWSERS_PATH and LD_LIBRARY_PATH before this
 * process starts (playwright reads PLAYWRIGHT_BROWSERS_PATH at module init).
 *
 * Prerequisites: `npm run browser:setup` (re-run after host reboot, /tmp is ephemeral).
 *
 * Artifacts: screenshots at /opt/workspace/runtime/browser-smoke/<ts>/
 */
import { mkdirSync, readFileSync } from 'fs'
import path from 'path'
import { chromium } from '@playwright/test'
import { WORKSPACE_PATHS } from '../src/lib/workspacePaths'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3100'

const PASSWORD = process.env.COMMAND_PASSWORD ||
  readFileSync(WORKSPACE_PATHS.envLocal, 'utf8').match(/COMMAND_PASSWORD=(.*)/)?.[1]?.trim()

if (!PASSWORD) {
  console.error('FAIL: COMMAND_PASSWORD not set and not found in .env.local')
  process.exit(1)
}

const TS = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
const ARTIFACT_DIR = path.join(WORKSPACE_PATHS.runtimeRoot, 'browser-smoke', TS)
mkdirSync(ARTIFACT_DIR, { recursive: true })

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
]

let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

async function main() {
  const browser = await chromium.launch({ args: LAUNCH_ARGS })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })

  const page = await context.newPage()

  // F2: capture client-side JS errors — the failure class server-side smoke cannot see
  let pageErrors = 0
  page.on('pageerror', (err) => {
    console.error(`  BROWSER JS ERROR: ${err.message}`)
    pageErrors++
  })

  try {
    // 1. /login — form renders with password field
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    const pwFields = await page.locator('input[type="password"]').count()
    check('/login renders password field', pwFields > 0, `count=${pwFields}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-login.png') })

    // 2. Auth: drive the actual form — fill and click submit
    // F3: catch auth failure cleanly instead of letting waitForURL throw
    let authed = false
    try {
      await page.locator('input[type="password"]').fill(PASSWORD!)
      await Promise.all([
        page.waitForURL(`${BASE}/`, { timeout: 8000 }),
        page.locator('button[type="submit"]').click(),
      ])
      authed = page.url() === `${BASE}/`
    } catch (authErr) {
      authed = false
    }
    check('login form → redirects to /', authed)
    if (!authed) {
      console.error('  Auth failed — remaining checks skipped (no valid session)')
      await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-auth-fail.png') })
      return
    }

    // 3. / (home) — owner observatory, with truthful empty projection state
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    check('/ renders owner observatory heading', await page.getByRole('heading', { name: /What changed, what is stuck/i }).count() === 1)
    check('/ renders decision queue', await page.getByRole('heading', { name: /Owner decision queue/i }).count() === 1)
    check('/ renders projection coherence', await page.getByRole('heading', { name: /Public versus private state/i }).count() === 1)
    const emptyProjection = await page.getByText('No versioned public projection has been emitted yet.').count() === 1
    const typedProjection = await page.getByText('1.0.0', { exact: true }).count() >= 1 && await page.getByText(/^sha256:[a-f0-9]{64}$/).count() >= 1
    check('/ reports a truthful typed-v1 or empty projection state', emptyProjection || typedProjection, `empty=${emptyProjection} typedV1=${typedProjection}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-home.png'), fullPage: true })

    // 4. Mobile authenticated coverage uses the same browser session/cookie.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'networkidle' })
    check('/ mobile keeps observatory heading visible', await page.getByRole('heading', { name: /What changed, what is stuck/i }).isVisible())
    check('/ mobile has no horizontal document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-home-mobile.png'), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })

    // 5. /attach/general — h1, live pane section, and WS snapshot delivery
    await page.goto(`${BASE}/attach/general`, { waitUntil: 'domcontentloaded' })
    const attachH1 = await page.locator('h1').filter({ hasText: /Attached to/ }).count()
    check('/attach/general renders "Attached to" h1', attachH1 > 0)
    const livePane = await page.getByText('Live pane', { exact: false }).count()
    check('/attach/general has "Live pane" section', livePane > 0)
    // F1: wait for WS snapshot to populate the pane — not just static HTML
    await page.waitForFunction(
      () => {
        const pre = document.querySelector('pre')
        return pre && pre.textContent && pre.textContent.trim().length > 0
      },
      { timeout: 5000 }
    ).catch(() => {})
    const paneText = await page.locator('pre').textContent().catch(() => '')
    check('/attach/general pane has WS snapshot content', (paneText ?? '').trim().length > 0,
      `pane chars=${(paneText ?? '').trim().length}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-attach-general.png') })

    // 6. /attach/general-codex
    await page.goto(`${BASE}/attach/general-codex`, { waitUntil: 'domcontentloaded' })
    const codexH1 = await page.locator('h1').filter({ hasText: /Attached to/ }).count()
    check('/attach/general-codex renders "Attached to" h1', codexH1 > 0)
    const codexPane = await page.getByText('Live pane', { exact: false }).count()
    check('/attach/general-codex has "Live pane" section', codexPane > 0)
    await page.waitForFunction(
      () => {
        const pre = document.querySelector('pre')
        return pre && pre.textContent && pre.textContent.trim().length > 0
      },
      { timeout: 5000 }
    ).catch(() => {})
    const codexPaneText = await page.locator('pre').textContent().catch(() => '')
    check('/attach/general-codex pane has WS snapshot content', (codexPaneText ?? '').trim().length > 0,
      `pane chars=${(codexPaneText ?? '').trim().length}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-attach-general-codex.png') })

    // 7. /artifacts — h1 and source sections
    await page.goto(`${BASE}/artifacts`, { waitUntil: 'networkidle' })
    const artifactsH1 = await page.locator('h1').filter({ hasText: /Artifacts/i }).count()
    check('/artifacts renders h1 "Artifacts"', artifactsH1 > 0)
    const sourceLabels = await page.getByText(/Research|Cross-cutting/i).count()
    check('/artifacts shows source labels', sourceLabels > 0, `count=${sourceLabels}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-artifacts.png') })

    // F2 final: check for accumulated page errors
    check('no unhandled browser JS errors', pageErrors === 0, `errors=${pageErrors}`)

  } finally {
    await browser.close()
  }

  console.log(`\nArtifacts: ${ARTIFACT_DIR}/`)
  console.log(
    failed === 0
      ? '\nBROWSER SMOKE PASSED'
      : `\nBROWSER SMOKE FAILED (${failed} check${failed > 1 ? 's' : ''})`
  )
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('browser-smoke threw:', e)
  process.exit(1)
})
