/**
 * Hermetic Playwright browser install (PLAYWRIGHT_BROWSERS_PATH=0) so Chromium lives under
 * node_modules for local/dev. On Vercel, screenshots use @sparticuz/chromium — downloading
 * full Playwright Chromium (~170MB) during postinstall routinely blows the 45m build limit.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const skipReasons = []
if (process.env.VERCEL === '1') skipReasons.push('VERCEL=1')
if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  skipReasons.push('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1')
}
if (process.env.SKIP_PLAYWRIGHT_CHROMIUM === '1') {
  skipReasons.push('SKIP_PLAYWRIGHT_CHROMIUM=1')
}

if (skipReasons.length > 0) {
  console.log(
    `install-playwright-chromium: skipping (${skipReasons.join(', ')}); serverless uses @sparticuz/chromium`
  )
  process.exit(0)
}

process.env.PLAYWRIGHT_BROWSERS_PATH = '0'

const playwrightPkg = join(process.cwd(), 'node_modules', 'playwright', 'package.json')
if (!existsSync(playwrightPkg)) {
  console.warn('install-playwright-chromium: playwright not installed, skipping')
  process.exit(0)
}

try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  })
} catch {
  process.exit(1)
}
