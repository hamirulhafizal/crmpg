import type {
  TryPostApiPost,
  TryPostCreatePostsBatchInput,
  TryPostSocialAccount,
  TryPostWorkspaceInfo,
} from '@/app/lib/trypost/types'

const DEFAULT_BASE_URL = 'https://app.trypost.it/api'

export class TryPostApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'TryPostApiError'
    this.status = status
    this.body = body
  }
}

export type TryPostClientOptions = {
  apiKey: string
  baseUrl?: string
}

function resolveBaseUrl(baseUrl?: string): string {
  const fromEnv = process.env.TRYPOST_API_BASE_URL?.trim()
  return (baseUrl || fromEnv || DEFAULT_BASE_URL).replace(/\/$/, '')
}

export function createTryPostClient(options: TryPostClientOptions) {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const apiKey = options.apiKey.trim()
  if (!apiKey) {
    throw new TryPostApiError('TryPost API key is required', 401)
  }

  async function request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    })

    if (res.status === 204) {
      return undefined as T
    }

    const text = await res.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { message: text }
      }
    }

    if (!res.ok) {
      const message =
        typeof json === 'object' &&
        json &&
        'message' in json &&
        typeof (json as { message: unknown }).message === 'string'
          ? (json as { message: string }).message
          : `TryPost API error (${res.status})`
      throw new TryPostApiError(message, res.status, json)
    }

    return json as T
  }

  return {
    baseUrl,

    getWorkspace() {
      return request<TryPostWorkspaceInfo>('/workspace')
    },

    async listSocialAccounts(page = 1): Promise<{
      data: TryPostSocialAccount[]
      meta?: { current_page: number; last_page: number; total: number }
    }> {
      return request(`/social-accounts?page=${page}`)
    },

    async listAllSocialAccounts(): Promise<TryPostSocialAccount[]> {
      const all: TryPostSocialAccount[] = []
      let page = 1
      for (;;) {
        const res = await this.listSocialAccounts(page)
        all.push(...(res.data ?? []))
        const last = res.meta?.last_page ?? page
        if (page >= last) break
        page += 1
        if (page > 50) break
      }
      return all
    },

    createPostsBatch(input: TryPostCreatePostsBatchInput) {
      return request<{ posts: TryPostApiPost[] }>('/posts/batch', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    listPosts(
      page = 1,
      filters?: {
        status?: 'draft' | 'scheduled' | 'published' | 'failed' | 'pending_approval'
        channels?: string[]
      }
    ) {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (filters?.status) params.set('status', filters.status)
      if (filters?.channels?.length) {
        for (const id of filters.channels) params.append('channels[]', id)
      }
      return request<{
        data: TryPostApiPost[]
        meta?: { current_page: number; last_page: number; total: number }
      }>(`/posts?${params.toString()}`)
    },

    async listAllPosts(
      filters?: {
        status?: 'draft' | 'scheduled' | 'published' | 'failed' | 'pending_approval'
        channels?: string[]
      },
      maxPages = 20
    ): Promise<TryPostApiPost[]> {
      const all: TryPostApiPost[] = []
      let page = 1
      for (;;) {
        const res = await this.listPosts(page, filters)
        all.push(...(res.data ?? []))
        const last = res.meta?.last_page ?? page
        if (page >= last || page >= maxPages) break
        page += 1
      }
      return all
    },

    getPost(postId: string) {
      return request<TryPostApiPost>(`/posts/${encodeURIComponent(postId)}`)
    },

    getPostMetrics(postId: string) {
      return request<{
        post_id: string
        platform?: string | null
        publish_status?: string
        platform_url?: string | null
        metrics?:
          | {
              available?: boolean
              unsupported?: boolean
              reason?: string | null
              snapshot?: {
                views_count?: number | null
                reach_count?: number | null
                impressions_count?: number | null
                engagement_count?: number | null
                reactions_count?: number | null
                comments_count?: number | null
              } | null
              metrics?: Record<
                string,
                { value?: number | null; unit?: string; availability?: string }
              >
              publication?: {
                permalink?: string | null
                account_display_name?: string | null
                account_username?: string | null
                account_avatar_url?: string | null
              }
            }
          | { unsupported: true; reason?: string }
      }>(`/posts/${encodeURIComponent(postId)}/metrics`)
    },

    deletePost(postId: string) {
      return request<void>(`/posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
      })
    },

    attachMediaFromUrls(
      postId: string,
      items: Array<{ url: string; alt?: string }>
    ) {
      return request(`/posts/${encodeURIComponent(postId)}/media/from-urls`, {
        method: 'POST',
        body: JSON.stringify({ media: items }),
      })
    },

    getWorkspaceAnalytics(params?: { range?: string }) {
      const range = params?.range ?? '30d'
      return request(`/analytics?range=${encodeURIComponent(range)}`)
    },

    getChannelInsights(accountId: string, params?: { range?: string }) {
      const range = params?.range ?? '30d'
      return request(
        `/channels/${encodeURIComponent(accountId)}/insights?range=${encodeURIComponent(range)}`
      )
    },
  }
}

export type TryPostClient = ReturnType<typeof createTryPostClient>

export function getPlatformTryPostApiKey(): string | null {
  const key = process.env.TRYPOST_API_KEY?.trim()
  return key || null
}
