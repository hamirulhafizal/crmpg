import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadActiveGoogleAdsDealers,
  type LeadRotationAgent,
} from '@/app/lib/google-ads/active-dealers-for-leads'

export type RotationQueueStatus = 'next' | 'waiting' | 'completed'

export type RotationQueueEntry = {
  participant_id: string
  user_id: string
  displayName: string
  usernamePgo: string
  image_url: string
  pgcode: string
  queuePosition: number
  status: RotationQueueStatus
  lead_email: boolean
  isYou: boolean
}

export type LeadRotationSnapshot = {
  cycleComplete: boolean
  nextRecipient: {
    participant_id: string
    displayName: string
    usernamePgo: string
    image_url: string
    pgcode: string
  } | null
  queue: RotationQueueEntry[]
  stats: {
    total: number
    available: number
    completed: number
  }
  yours: {
    inRotation: boolean
    isYourTurn: boolean
    queuePosition: number | null
    waitingAhead: number
    status: RotationQueueStatus | null
  }
}

function queueStatusForDealer(
  dealer: LeadRotationAgent,
  next: LeadRotationAgent | null
): RotationQueueStatus {
  if (!dealer.lead_email && next?.participant_id === dealer.participant_id) return 'next'
  if (dealer.lead_email) return 'completed'
  return 'waiting'
}

export function buildLeadRotationSnapshot(
  dealers: LeadRotationAgent[],
  viewerUserId?: string | null
): LeadRotationSnapshot {
  const next = dealers.find((d) => !d.lead_email) ?? null
  const cycleComplete = dealers.length > 0 && dealers.every((d) => d.lead_email)

  const queue: RotationQueueEntry[] = dealers.map((dealer, index) => ({
    participant_id: dealer.participant_id,
    user_id: dealer.user_id,
    displayName: dealer.displayName,
    usernamePgo: dealer.usernamePgo,
    image_url: dealer.image_url,
    pgcode: dealer.pgcode,
    queuePosition: index + 1,
    status: queueStatusForDealer(dealer, next),
    lead_email: dealer.lead_email,
    isYou: Boolean(viewerUserId && dealer.user_id === viewerUserId),
  }))

  const completed = dealers.filter((d) => d.lead_email).length
  const available = dealers.length - completed

  const yoursEntry = viewerUserId
    ? queue.find((row) => row.user_id === viewerUserId) ?? null
    : null

  let waitingAhead = 0
  if (yoursEntry && yoursEntry.status === 'waiting' && next) {
    const nextIndex = queue.findIndex((row) => row.participant_id === next.participant_id)
    const yoursIndex = queue.findIndex((row) => row.participant_id === yoursEntry.participant_id)
    if (nextIndex >= 0 && yoursIndex >= 0) {
      waitingAhead = Math.max(0, yoursIndex - nextIndex)
    }
  }

  return {
    cycleComplete,
    nextRecipient: next
      ? {
          participant_id: next.participant_id,
          displayName: next.displayName,
          usernamePgo: next.usernamePgo,
          image_url: next.image_url,
          pgcode: next.pgcode,
        }
      : null,
    queue,
    stats: {
      total: dealers.length,
      available,
      completed,
    },
    yours: {
      inRotation: Boolean(yoursEntry),
      isYourTurn: yoursEntry?.status === 'next',
      queuePosition: yoursEntry?.queuePosition ?? null,
      waitingAhead,
      status: yoursEntry?.status ?? null,
    },
  }
}

export async function getLeadRotationSnapshot(
  admin: SupabaseClient,
  viewerUserId?: string | null
): Promise<LeadRotationSnapshot> {
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  return buildLeadRotationSnapshot(dealers, viewerUserId)
}
