/**
 * Hermetic Playwright browser install (PLAYWRIGHT_BROWSERS_PATH=0) so Chromium lives under
 * node_modules and can be bundled on Vercel serverless (no ~/.cache at runtime).
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
