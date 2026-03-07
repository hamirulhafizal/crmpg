/**
 * WAHA (WhatsApp HTTP API) client helpers.
 * Backend: https://api.publicgolds.com (set via WAHA_API_BASE_URL).
 */

const BASE_URL = (process.env.WAHA_API_BASE_URL || 'https://api.publicgolds.com').replace(/\/$/, '')
const API_KEY = process.env.WAHA_API_KEY || ''

export function getWahaConfig() {
  return { baseUrl: BASE_URL, apiKey: API_KEY }
}

export function isWahaConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY)
}

export async function wahaFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_KEY) {
    throw new Error('WAHA_API_KEY is not configured')
  }
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...options.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `WAHA API error ${res.status}`
    try {
      const json = JSON.parse(text)
      message = json.message || json.error || json.detail || message
    } catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}
