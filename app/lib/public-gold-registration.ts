import { tmpdir } from 'node:os'
import path from 'path'

import type { Browser, BrowserContext, LaunchOptions } from 'playwright-core'

import { sendGapLeadWhatsAppImage, sendGapLeadWhatsAppMessages } from '@/app/lib/gap-lead-whatsapp'
import { formatPhoneForDisplay } from '@/app/lib/phone-msisdn'

/**
 * Hermetic browsers under node_modules (postinstall). Required on Vercel serverless — there is no
 * stable ~/.cache; omitting this made fallback resolve to /tmp/.cache/ms-playwright and fail.
 */
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0'
}

const BROWSER_CONTEXT_OPTIONS = {
  locale: 'en-MY' as const,
  timezoneId: 'Asia/Kuala_Lumpur',
  viewport: { width: 1366, height: 768 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  extraHTTPHeaders: {
    'Accept-Language': 'en-MY,en;q=0.9,ms-MY;q=0.8',
    Referer: 'https://publicgold.com.my/',
  },
}

type LaunchedBrowser =
  | { mode: 'ephemeral'; browser: Browser; cleanup: () => Promise<void> }
  | { mode: 'persistent'; context: BrowserContext; cleanup: () => Promise<void> }

function useServerlessChromiumBundle(): boolean {
  if (process.env.USE_SPARTICUZ_CHROMIUM === 'false') return false
  const serverless =
    process.env.VERCEL === '1' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.USE_SPARTICUZ_CHROMIUM === 'true'
  if (!serverless) return false
  // @sparticuz/chromium ships Linux x64/arm64 only (not macOS/Windows local dev).
  if (process.platform !== 'linux') return false
  return true
}

function localPlaywrightLaunchOptions(): LaunchOptions {
  const base: LaunchOptions = { headless: true }
  if (process.platform === 'linux') {
    base.args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  }
  return base
}

/**
 * Linux serverless: try @sparticuz/chromium first, then hermetic Playwright from postinstall.
 * Playwright rejects `--user-data-dir` on launch(); use launchPersistentContext per Sparticuz/Lambda notes.
 * @see https://github.com/Sparticuz/chromium — Usage with Playwright
 */
async function launchBrowser(): Promise<LaunchedBrowser> {
  if (!useServerlessChromiumBundle()) {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch(localPlaywrightLaunchOptions())
    return { mode: 'ephemeral', browser, cleanup: async () => {} }
  }

  const { randomUUID } = await import('node:crypto')
  const { rm } = await import('node:fs/promises')
  const userDataDir = `/tmp/pw-${randomUUID()}`

  const sparticuzMod = await import('@sparticuz/chromium')
  const sparticuz = sparticuzMod.default
  sparticuz.setGraphicsMode = false

  let sparticuzError: unknown
  try {
    const { chromium: pwChromium } = await import('playwright-core')
    const executablePath = await sparticuz.executablePath()
    const context = await pwChromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath,
      args: sparticuz.args,
      ...BROWSER_CONTEXT_OPTIONS,
    })
    return {
      mode: 'persistent',
      context,
      cleanup: async () => {
        await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
      },
    }
  } catch (e: unknown) {
    sparticuzError = e
    console.warn('Public Gold: @sparticuz/chromium launch failed, trying hermetic Playwright:', e)
  }

  try {
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    return { mode: 'ephemeral', browser, cleanup: async () => {} }
  } catch (fallbackErr: unknown) {
    const a = sparticuzError instanceof Error ? sparticuzError.message : String(sparticuzError)
    const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
    throw new Error(`@sparticuz/chromium: ${a} | Playwright fallback: ${b}`)
  }
}

export type PublicGoldRegistrationInput = {
  fullName: string
  icNumber: string
  email: string
  phone: string
  introPgCode: string
  location?: string
  /** Dealer / introducer WhatsApp (MSISDN); screenshot is sent here via GAP lead WAHA settings */
  introducerPhone?: string
}

export type PublicGoldRegistrationResult = {
  ok: boolean
  finalUrl: string
  statusText: string
}

const REGISTER_URL = 'https://publicgold.com.my/index.php?route=account/register'

function normalizePgCode(raw: string): string {
  const pg = raw.trim().toUpperCase()
  return pg.startsWith('PG') ? pg : `PG${pg}`
}

function toIsoDobFromIc(ic: string): string | null {
  const onlyDigits = ic.replace(/\D/g, '')
  if (onlyDigits.length < 6) return null

  const yy = Number(onlyDigits.slice(0, 2))
  const mm = Number(onlyDigits.slice(2, 4))
  const dd = Number(onlyDigits.slice(4, 6))
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null

  const now = new Date()
  const current2DigitYear = now.getFullYear() % 100
  const year = yy <= current2DigitYear ? 2000 + yy : 1900 + yy

  const candidate = new Date(`${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`)
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== mm ||
    candidate.getUTCDate() !== dd
  ) {
    return null
  }

  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function normalizeMsisdn(phone: string): { dialCode: string; localNumber: string } {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('60')) {
    return { dialCode: '60', localNumber: digits.slice(2) }
  }
  return { dialCode: '60', localNumber: digits }
}

function chooseBranchOption(location?: string): string {
  const source = (location || '').toLowerCase()
  if (source.includes('johor')) return '11'
  if (source.includes('penang') || source.includes('pulau pinang')) return '17'
  if (source.includes('kedah')) return '1'
  if (source.includes('kelantan')) return '12'
  if (source.includes('terengganu')) return '13'
  if (source.includes('pahang')) return '14'
  if (source.includes('sabah')) return '21'
  if (source.includes('sarawak')) return '22'
  if (source.includes('selangor') || source.includes('kuala lumpur')) return '34'
  if (source.includes('perak')) return '10'
  if (source.includes('malacca') || source.includes('melaka')) return '6'
  return '18'
}

async function assertRegistrationFormIsReachable(pageUrl: string, html: string): Promise<void> {
  const loweredHtml = html.toLowerCase()
  const blockedSignals = [
    '403 forbidden',
    'access denied',
    'microsoft-azure-application-gateway',
    'application-gateway/v2',
  ]
  const isBlocked = blockedSignals.some((signal) => loweredHtml.includes(signal))
  if (isBlocked) {
    throw new Error(
      `Public Gold blocked this request (403/Access Denied). URL: ${pageUrl}. This usually means anti-bot/network filtering on the target website.`
    )
  }
}

function isGatewayBlockError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.toLowerCase().includes('blocked this request')
}

async function runRegistrationAttempt(
  page: import('playwright').Page,
  input: PublicGoldRegistrationInput,
  introPgCode: string,
  dialCode: string,
  localNumber: string,
  dob: string,
  useStealthDelay = false
): Promise<PublicGoldRegistrationResult> {
  const targetUrl = `${REGISTER_URL}&intro_pgcode=${encodeURIComponent(introPgCode)}&is_dealer=1`
  // const targetUrl = `${REGISTER_URL}&intro_pgcode=PG00104899&is_dealer=1`
  if (useStealthDelay) {
    await page.waitForTimeout(700)
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const pageHtml = await page.content()
  await assertRegistrationFormIsReachable(page.url(), pageHtml)
  await page.waitForSelector('#label-name', { timeout: 15000 })


  await page.fill('#label-name', input.fullName)
  await page.selectOption('#idselect', 'newic')
  await page.fill('#label-ic', input.icNumber.replace(/\D/g, ''))


  console.log('filling dob', dob)
  console.log('filling email', input.email.trim())
  console.log('filling phone', localNumber)
  console.log('filling dial code', dialCode)
  console.log('selecting branch', chooseBranchOption(input.location))



  // #label-dob is readonly (datepicker), so fill() will fail as not editable.
  // Set value via DOM and dispatch events so site scripts pick up the change.
  await page.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>('#label-dob')
    if (!input) throw new Error('DOB input #label-dob not found')
    input.value = value
    input.setAttribute('value', value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
  }, dob)
  await page.fill('#label-email', input.email.trim())
  await page.fill('#label-mobile', localNumber)

  await page.evaluate((code) => {
    const dialInput = document.querySelector<HTMLInputElement>('#label-mobile-dialcode')
    if (!dialInput) return
    dialInput.value = code
    dialInput.setAttribute('value', code)
    dialInput.dispatchEvent(new Event('input', { bubbles: true }))
    dialInput.dispatchEvent(new Event('change', { bubbles: true }))
  }, dialCode)

  await page.selectOption('#upreferredbranch', chooseBranchOption(input.location))

  await page.click('#form_submit')
  await page.waitForTimeout(3500)

  // Vercel/serverless: /var/task (cwd) is read-only — screenshots must go to tmpdir.
  const screenshotPath = path.join(tmpdir(), `Registration-${introPgCode}-entire-page.png`)

  const runWaha = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e: unknown) {
      console.warn(`WAHA (${label}) failed:`, e instanceof Error ? e.message : e)
    }
  }

  const dangerMessages = await page.locator('.alert-danger p').allTextContents()
  const normalizedDanger = dangerMessages.map((t) => t.trim()).filter(Boolean).join(' ')

  if (normalizedDanger) {
    await runWaha('failure: full-page + lead', async () => {

      await page.screenshot({ path: screenshotPath, fullPage: true })
      const wa = await sendGapLeadWhatsAppImage({
        dealerPhone: input.introducerPhone,
        imagePath: screenshotPath,
        caption: `New GAP registration received: 
        \nName: ${input.fullName}
        \nIC: ${input.icNumber}
        \nPhone: ${formatPhoneForDisplay(input.phone)}
        \nLocation: ${input.location ?? ''}
        \nEmail: ${input.email}
        `.trim(),
      })

      if (!wa.sentToDealer && !wa.sentCc && wa.skipReason) {
        console.warn('WAHA screenshot skipped:', wa.skipReason)
      }
    })
    return {
      ok: false,
      finalUrl: page.url(),
      statusText: normalizedDanger,
    }
  }

  const successMessages = await page.locator('.alert-success p').allTextContents()
  const normalizedSuccess = successMessages.map((t) => t.trim()).filter(Boolean).join(' ')

  await runWaha('success: viewport + link + login', async () => {
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const wa = await sendGapLeadWhatsAppImage({
      dealerPhone: input.introducerPhone,
      imagePath: screenshotPath,
    })
    if (!wa.sentToDealer && !wa.sentCc && wa.skipReason) {
      console.warn('WAHA screenshot skipped:', wa.skipReason)
    }
    const icDigits = input.icNumber.replace(/\D/g, '')
    await sendGapLeadWhatsAppMessages({
      dealerPhone: input.introducerPhone,
      text: 'https://publicgold.com.my/index.php?route=account/login',
    })
    await sendGapLeadWhatsAppMessages({
      dealerPhone: input.introducerPhone,
      text: `Username: ${icDigits}\nPassword: ${icDigits}`,
    })
  })

  return {
    ok: true,
    finalUrl: page.url(),
    statusText: normalizedSuccess || 'Registration submitted successfully.',
  }
}

export async function registerCustomerAtPublicGold(
  input: PublicGoldRegistrationInput
): Promise<PublicGoldRegistrationResult> {
  const introPgCode = normalizePgCode(input.introPgCode)
  const dob = toIsoDobFromIc(input.icNumber)
  if (!dob) {
    throw new Error('Unable to derive DOB from IC number (requires valid YYMMDD prefix).')
  }

  const { dialCode, localNumber } = normalizeMsisdn(input.phone)
  if (!localNumber) throw new Error('Phone number is required for Public Gold registration.')


  let handle: LaunchedBrowser
  try {
    handle = await launchBrowser()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Public Gold Chromium launch:', e)
    return {
      ok: false,
      finalUrl: '',
      statusText:
        `Chromium failed to start: ${msg.slice(0, 900)}. ` +
        'Local: run `npx playwright install chromium`. Vercel: use @sparticuz/chromium (see next.config serverExternalPackages) and ensure `postinstall` runs; check deployment CPU (arm64 may need chromium-min).',
    }
  }
  console.log('browser launched')

  try {
    if (handle.mode === 'ephemeral') {
      const { browser } = handle
      const primaryContext = await browser.newContext(BROWSER_CONTEXT_OPTIONS)
      const primaryPage = await primaryContext.newPage()
      primaryPage.on('dialog', async (dialog) => {
        try {
          await dialog.accept()
        } catch {
          // Ignore dialog race conditions if already handled.
        }
      })

      return await (async () => {
        try {
          return await runRegistrationAttempt(
            primaryPage,
            input,
            introPgCode,
            dialCode,
            localNumber,
            dob
          )
        } catch (error: unknown) {
          if (!isGatewayBlockError(error)) throw error
          console.warn('Primary Public Gold attempt blocked; retrying with default browser context...')
        } finally {
          await primaryContext.close()
        }

        const fallbackPage = await browser.newPage()
        fallbackPage.on('dialog', async (dialog) => {
          try {
            await dialog.accept()
          } catch {
            // Ignore dialog race conditions if already handled.
          }
        })
        try {
          return await runRegistrationAttempt(
            fallbackPage,
            input,
            introPgCode,
            dialCode,
            localNumber,
            dob,
            true
          )
        } finally {
          await fallbackPage.close()
        }
      })()
    }

    const { context } = handle
    const primaryPage = await context.newPage()
    primaryPage.on('dialog', async (dialog) => {
      try {
        await dialog.accept()
      } catch {
        // Ignore dialog race conditions if already handled.
      }
    })

    return await (async () => {
      try {
        return await runRegistrationAttempt(
          primaryPage,
          input,
          introPgCode,
          dialCode,
          localNumber,
          dob
        )
      } catch (error: unknown) {
        if (!isGatewayBlockError(error)) throw error
        console.warn('Primary Public Gold attempt blocked; retrying with default browser context...')
      } finally {
        await primaryPage.close()
      }

      const fallbackPage = await context.newPage()
      fallbackPage.on('dialog', async (dialog) => {
        try {
          await dialog.accept()
        } catch {
          // Ignore dialog race conditions if already handled.
        }
      })
      try {
        return await runRegistrationAttempt(
          fallbackPage,
          input,
          introPgCode,
          dialCode,
          localNumber,
          dob,
          true
        )
      } finally {
        await fallbackPage.close()
      }
    })()
  } finally {
    if (handle.mode === 'ephemeral') {
      await handle.browser.close()
    } else {
      await handle.context.close()
    }
    await handle.cleanup()
  }
}
