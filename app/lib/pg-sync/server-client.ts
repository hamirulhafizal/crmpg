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

export type PgSyncFetchOptions = RequestInit & {
  /** Abort the request after this many ms (worker may block on long steps). */
  timeoutMs?: number
}

function isFetchAbortError(e: unknown): boolean {
  if (e instanceof Error && e.name === 'AbortError') return true
  const msg = e instanceof Error ? e.message : String(e)
  return /aborted|timeout/i.test(msg)
}

export async function pgSyncFetch<T>(
  path: string,
  init?: PgSyncFetchOptions
): Promise<T> {
  const { timeoutMs, ...fetchInit } = init ?? {}
  const url = `${pgSyncApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`

  const controller = timeoutMs != null && timeoutMs > 0 ? new AbortController() : null
  const timer =
    controller != null
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null

  let res: Response
  try {
    res = await fetch(url, {
      ...fetchInit,
      signal: controller?.signal,
      headers: {
        Accept: 'application/json',
        ...(fetchInit.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchInit.headers,
      },
      cache: 'no-store',
    })
  } catch (e: unknown) {
    if (timer) clearTimeout(timer)
    if (isFetchAbortError(e)) {
      throw new PgSyncApiError('Sync worker request timed out', 408, path)
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }

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
