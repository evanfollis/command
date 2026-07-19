#!/usr/bin/env tsx
/** Authenticated Chromium smoke for the read-only Command owner observatory. */
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

let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  let pageErrors = 0
  page.on('pageerror', (error) => {
    console.error(`  BROWSER JS ERROR: ${error.message}`)
    pageErrors++
  })

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    check('/login renders password field', await page.locator('input[type="password"]').count() === 1)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-login.png') })

    await page.locator('input[type="password"]').fill(PASSWORD!)
    await Promise.all([
      page.waitForURL(`${BASE}/`, { timeout: 8000 }),
      page.locator('button[type="submit"]').click(),
    ])
    check('login form redirects to /', page.url() === `${BASE}/`)
    await page.waitForLoadState('networkidle').catch(() => {})

    check('/ renders owner observatory', await page.getByRole('heading', { name: /What changed, what is stuck/i }).count() === 1)
    check('/ renders owner decision queue', await page.getByRole('heading', { name: /Owner decision queue/i }).count() === 1)
    check('/ renders projection coherence', await page.getByRole('heading', { name: /Public versus private state/i }).count() === 1)
    check('/ renders closure conversion', await page.getByRole('heading', { name: /Is diagnosis becoming execution/i }).count() === 1)
    check('/ renders current cycles and owners', await page.getByRole('heading', { name: /Current work and accountable owners/i }).count() === 1)
    check('/ renders deployment and durability', await page.getByRole('heading', { name: /Deployment and remote identity/i }).count() === 1)
    check('/ renders prompt eval reliability', await page.getByRole('heading', { name: /Prompt, eval, fallback, and reliability/i }).count() === 1)
    check('navigation exposes only read-only drilldowns',
      await page.getByRole('link', { name: 'Evidence lineage', exact: true }).count() >= 1 &&
      await page.getByRole('link', { name: 'Artifacts', exact: true }).count() >= 1 &&
      await page.getByRole('link', { name: /Operator tools|Attach|Session|Review/i }).count() === 0)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-home.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload({ waitUntil: 'networkidle' })
    check('/ mobile keeps observatory heading visible', await page.getByRole('heading', { name: /What changed, what is stuck/i }).isVisible())
    const mobileWidth = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
    }))
    check('/ mobile has no horizontal overflow', mobileWidth.scroll <= mobileWidth.client, `client=${mobileWidth.client} scroll=${mobileWidth.scroll} offenders=${mobileWidth.offenders.join(' | ')}`)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-home-mobile.png'), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })

    await page.goto(`${BASE}/lineage`, { waitUntil: 'networkidle' })
    check('/lineage renders artifact lineage', await page.getByRole('heading', { name: /Evidence and artifact lineage/i }).count() === 1)
    check('/lineage has no transcript attach', await page.getByRole('link', { name: /transcript|attach/i }).count() === 0)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-lineage.png'), fullPage: true })

    await page.goto(`${BASE}/symphony`, { waitUntil: 'networkidle' })
    check('/symphony is labeled read-only', await page.getByText('Read-only lifecycle evidence', { exact: true }).count() === 1)
    check('/symphony has no mutation controls', await page.getByRole('button', { name: /create|transition|start|done|defer/i }).count() === 0)
    check('/symphony has no form controls', await page.locator('form, input, textarea, select').count() === 0)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-symphony.png'), fullPage: true })

    await page.goto(`${BASE}/artifacts`, { waitUntil: 'networkidle' })
    check('/artifacts remains available', await page.getByRole('heading', { name: /Artifacts/i }).count() === 1)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-artifacts.png'), fullPage: true })

    for (const route of ['/operator-tools', '/attach/general', '/sessions/general']) {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      check(`${route} returns authenticated 404`, response?.status() === 404, `status=${response?.status()}`)
    }

    check('no unhandled browser JS errors', pageErrors === 0, `errors=${pageErrors}`)
  } finally {
    await browser.close()
  }

  console.log(`\nArtifacts: ${ARTIFACT_DIR}/`)
  console.log(failed === 0 ? '\nBROWSER SMOKE PASSED' : `\nBROWSER SMOKE FAILED (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('browser-smoke threw:', error)
  process.exit(1)
})
