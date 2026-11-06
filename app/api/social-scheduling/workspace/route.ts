import { NextResponse } from 'next/server'

import { TryPostApiError } from '@/app/lib/trypost/client'
import {
  loadTryPostEntitlements,
  requireSocialSchedulingApi,
} from '@/app/lib/trypost/access'
import {
  connectTryPostWorkspace,
  disconnectTryPostWorkspace,
  getTryPostWorkspacePublic,
  syncTryPostChannels,
} from '@/app/lib/trypost/workspaces'

function errorResponse(err: unknown) {
  if (err instanceof TryPostApiError) {
    return NextResponse.json(
      { error: err.message, details: err.body },
      { status: err.status >= 400 && err.status < 600 ? err.status : 500 }
    )
  }
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const [workspace, entitlements] = await Promise.all([
      getTryPostWorkspacePublic(auth.user.id),
      loadTryPostEntitlements(auth.user.id),
    ])
    return NextResponse.json({
      workspace,
      entitlements,
      assistedSetup: {
        createWorkspaceUrl: 'https://app.trypost.it/settings/workspace',
        apiKeysUrl: 'https://app.trypost.it/settings/workspace/api-keys',
        channelsUrl: 'https://app.trypost.it/settings/channels',
        steps: [
          'In TryPost, create a workspace for this CRMpg user (account owner only).',
          'Connect social channels in that workspace (or use Connect channel in Social Posts).',
          'Create a workspace API key (Settings → API Keys) and paste it here.',
          'Or, for the platform owner workspace, connect with the server TRYPOST_API_KEY.',
        ],
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as {
      apiKey?: string
      usePlatformKey?: boolean
    }

    const workspace = await connectTryPostWorkspace({
      userId: auth.user.id,
      apiKey: body.apiKey,
      usePlatformKey: body.usePlatformKey === true,
    })
    const entitlements = await loadTryPostEntitlements(auth.user.id)
    return NextResponse.json({ workspace, entitlements })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action !== 'sync') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }
    const workspace = await syncTryPostChannels(auth.user.id)
    return NextResponse.json({ workspace })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    await disconnectTryPostWorkspace(auth.user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
