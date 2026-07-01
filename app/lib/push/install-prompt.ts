/** Captures beforeinstallprompt as early as possible (before React hydrates). */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Listener = () => void

declare global {
  interface Window {
    __pgcrmDeferredInstallPrompt?: BeforeInstallPromptEvent | null
    __pgcrmInstallPromptInit?: boolean
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<Listener>()
let initialized = false

function syncFromWindow() {
  if (typeof window !== 'undefined' && window.__pgcrmDeferredInstallPrompt) {
    deferredPrompt = window.__pgcrmDeferredInstallPrompt
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function initInstallPromptCapture() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  syncFromWindow()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    window.__pgcrmDeferredInstallPrompt = deferredPrompt
    notifyListeners()
  })

  window.addEventListener('pgcrm-installprompt-ready', () => {
    syncFromWindow()
    notifyListeners()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.__pgcrmDeferredInstallPrompt = null
    notifyListeners()
  })
}

initInstallPromptCapture()

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  syncFromWindow()
  return deferredPrompt ?? window.__pgcrmDeferredInstallPrompt ?? null
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  if (typeof window === 'undefined') return () => {}

  initInstallPromptCapture()
  listeners.add(listener)

  const onReady = () => listener()
  window.addEventListener('pgcrm-installprompt-ready', onReady)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('pgcrm-installprompt-ready', onReady)
  }
}

export async function showNativeInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = getDeferredInstallPrompt()
  if (!prompt) return 'unavailable'

  await prompt.prompt()
  const { outcome } = await prompt.userChoice

  if (outcome === 'accepted') {
    deferredPrompt = null
    if (typeof window !== 'undefined') {
      window.__pgcrmDeferredInstallPrompt = null
    }
    notifyListeners()
  }

  return outcome
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null
  if (typeof window !== 'undefined') {
    window.__pgcrmDeferredInstallPrompt = null
  }
  notifyListeners()
}
