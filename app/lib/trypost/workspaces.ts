import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  TryPostApiError,
  createTryPostClient,
  getPlatformTryPostApiKey,
  type TryPostClient,
} from '@/app/lib/trypost/client'
import {
  filterSupportedChannels,
  type TryPostSocialAccount,
  type TryPostWorkspacePublic,
  type TryPostWorkspaceRow,
} from '@/app/lib/trypost/types'

/** TryPost list-social-accounts omits avatars; posts expose display_avatar — merge them in. */
async function enrichChannelsWithAvatars(
  client: TryPostClient,
  accounts: TryPostSocialAccount[]
): Promise<TryPostSocialAccount[]> {
  if (!accounts.length) return accounts
  try {
    const posts = await client.listAllPosts(undefined, 5)
    const avatarByAccount = new Map<string, string>()
    for (const post of posts) {
      const accountId =
        (typeof post.social_account === 'object' &&
        post.social_account &&
        'id' in post.social_account
          ? String((post.social_account as { id?: string }).id ?? '')
          : '') || String(post.social_account_id ?? '')
      const avatar =
        typeof post.display_avatar === 'string' ? post.display_avatar.trim() : ''
      if (accountId && avatar && !avatarByAccount.has(accountId)) {
        avatarByAccount.set(accountId, avatar)
      }
    }
    if (!avatarByAccount.size) return accounts
    return accounts.map((account) => ({
      ...account,
      avatar_url: avatarByAccount.get(account.id) ?? account.avatar_url ?? null,
    }))
  } catch {
    return accounts
  }
}

function normalizeChannels(value: unknown): TryPostSocialAccount[] {
  if (Array.isArray(value)) return value as TryPostSocialAccount[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as TryPostSocialAccount[]) : []
    } catch {
      return []
    }
  }
  return []
}

function toPublic(row: TryPostWorkspaceRow): TryPostWorkspacePublic {
  const { api_key: _apiKey, ...rest } = row
  return {
    ...rest,
    channels: normalizeChannels(row.channels),
    apiKeyConfigured: Boolean(_apiKey),
  }
}

export async function loadTryPostWorkspaceForUser(
  userId: string
): Promise<TryPostWorkspaceRow | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('trypost_workspaces')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as TryPostWorkspaceRow
  return {
    ...row,
    channels: normalizeChannels(row.channels),
  }
}

export async function getTryPostWorkspacePublic(
  userId: string
): Promise<TryPostWorkspacePublic | null> {
  const row = await loadTryPostWorkspaceForUser(userId)
  return row ? toPublic(row) : null
}

export async function getTryPostClientForUser(userId: string) {
  const row = await loadTryPostWorkspaceForUser(userId)
  if (!row?.api_key) {
    throw new TryPostApiError('TryPost workspace is not connected', 400)
  }
  return { client: createTryPostClient({ apiKey: row.api_key }), workspace: row }
}

export async function connectTryPostWorkspace(input: {
  userId: string
  apiKey?: string | null
  usePlatformKey?: boolean
}): Promise<TryPostWorkspacePublic> {
  const apiKey = input.usePlatformKey
    ? getPlatformTryPostApiKey()
    : input.apiKey?.trim() || null

  if (!apiKey) {
    throw new TryPostApiError(
      input.usePlatformKey
        ? 'TRYPOST_API_KEY is not configured on the server'
        : 'Workspace API key is required',
      400
    )
  }

  const client = createTryPostClient({ apiKey })
  const workspace = await client.getWorkspace()
  const accounts = await enrichChannelsWithAvatars(
    client,
    filterSupportedChannels(await client.listAllSocialAccounts())
  )
  const channels = accounts

  const admin = createServiceRoleClient()
  const payload = {
    user_id: input.userId,
    trypost_workspace_id: workspace.id,
    trypost_workspace_name: workspace.name ?? null,
    api_key: apiKey,
    status: 'connected' as const,
    last_error: null,
    channels,
    channels_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from('trypost_workspaces')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error || !data) {
    throw new TryPostApiError(error?.message || 'Failed to save TryPost workspace', 500)
  }

  return toPublic(data as TryPostWorkspaceRow)
}

export async function syncTryPostChannels(userId: string): Promise<TryPostWorkspacePublic> {
  const { client, workspace } = await getTryPostClientForUser(userId)
  const channels = await enrichChannelsWithAvatars(
    client,
    filterSupportedChannels(await client.listAllSocialAccounts())
  )

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('trypost_workspaces')
    .update({
      channels,
      channels_synced_at: new Date().toISOString(),
      status: 'connected',
      last_error: null,
      trypost_workspace_name: (await client.getWorkspace()).name ?? workspace.trypost_workspace_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workspace.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new TryPostApiError(error?.message || 'Failed to sync channels', 500)
  }

  return toPublic(data as TryPostWorkspaceRow)
}

export async function disconnectTryPostWorkspace(userId: string): Promise<void> {
  const admin = createServiceRoleClient()
  const { error } = await admin.from('trypost_workspaces').delete().eq('user_id', userId)
  if (error) {
    throw new TryPostApiError(error.message || 'Failed to disconnect workspace', 500)
  }
}

export function countConnectedChannels(channels: TryPostSocialAccount[]): number {
  return channels.filter((c) => c.status === 'connected').length
}
