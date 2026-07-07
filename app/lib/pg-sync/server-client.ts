import { pgSyncApiBaseUrl } from '@/app/lib/pg-sync/config'

export class PgSyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'PgSyncApiError'
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function pgSyncFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${pgSyncApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  })

  const body = await parseJsonSafe(res)
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'detail' in body
        ? JSON.stringify((body as { detail: unknown }).detail)
        : typeof body === 'string'
          ? body
          : `Sync API error (${res.status})`
    throw new PgSyncApiError(msg, res.status, body)
  }

  return body as T
}
