import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { loadActiveGoogleAdsDealers } from '@/app/lib/google-ads/active-dealers-for-leads'

const ROTATION_ROW_ID = 'public_gold_content'

// Normalize HTML content to prevent hydration errors
const normalizeHtml = (html: string): string => {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

async function getRotationIndex(): Promise<number> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('app_dealer_rotation')
    .select('current_index')
    .eq('id', ROTATION_ROW_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return typeof data?.current_index === 'number' ? data.current_index : 0
}

async function setRotationIndex(nextIndex: number): Promise<void> {
  const admin = createServiceRoleClient()
  const { error } = await admin.from('app_dealer_rotation').upsert(
    {
      id: ROTATION_ROW_ID,
      current_index: nextIndex,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  if (error) throw new Error(error.message)
}

/**
 * Public Gold page slug for `page-1` — rotates among **active** Google Ads dealers (same pool as landing leads).
 */
export async function getDealerData(): Promise<string> {
  const admin = createServiceRoleClient()
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  if (dealers.length === 0) {
    throw new Error('No dealers available.')
  }
  const idxRaw = await getRotationIndex()
  const idx = ((idxRaw % dealers.length) + dealers.length) % dealers.length
  return dealers[idx].slug
}

export async function getDealerInfo(): Promise<{
  username: string
  name?: string
  location?: string
  customers?: number
  no_tel?: string
  image_url?: string
  email?: string
}> {
  try {
    const admin = createServiceRoleClient()
    const { dealers } = await loadActiveGoogleAdsDealers(admin)
    if (dealers.length === 0) {
      throw new Error('No dealers available.')
    }
    const idxRaw = await getRotationIndex()
    const idx = ((idxRaw % dealers.length) + dealers.length) % dealers.length
    const d = dealers[idx]

    return {
      username: d.slug,
      name: d.displayName,
      location: 'Malaysia',
      customers: 0,
      no_tel: d.no_tel || '0123456789',
      image_url: d.image_url,
      email: d.email,
    }
  } catch (error) {
    console.error('Error in getDealerInfo:', error)
    return {
      username: 'default',
      name: 'Dealer',
      location: 'Malaysia',
      customers: 300,
      no_tel: '0123456789',
      image_url: 'https://via.placeholder.com/150',
    }
  }
}

/** Advance rotation cursor (called from page-1 after load). */
export async function updateDealerIndex(): Promise<void> {
  const admin = createServiceRoleClient()
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  if (dealers.length === 0) {
    throw new Error('No dealers available.')
  }
  const idx = await getRotationIndex()
  const nextIndex = (idx + 1) % dealers.length
  await setRotationIndex(nextIndex)
}

export async function getPageContent(url: string): Promise<string> {
  try {
    if (!url) {
      throw new Error('URL is required')
    }

    const response = await fetch(`https://publicgoldofficial.com/page/${url}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch content: ${response.status}`)
    }

    const content = await response.text()
    return normalizeHtml(content)
  } catch (error) {
    console.error('Error in getPageContent:', error)
    throw error
  }
}
