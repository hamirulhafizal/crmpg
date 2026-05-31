import type { SupabaseClient } from '@supabase/supabase-js'

import { isGapFormLead } from '@/app/lib/google-ads/gap-leads'
import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { parseGapMbox, type ParsedGapMboxLead } from '@/app/lib/google-ads/parse-gap-mbox'

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizePhone(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return normalizePhoneToMsisdn(digits)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function messageIdFromOriginalData(originalData: unknown): string | null {
  const raw = asRecord(originalData)['Message-ID']
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function buildGapOriginalData(
  lead: ParsedGapMboxLead,
  dealerEmail: string,
  existingOriginalData?: unknown
): Record<string, unknown> {
  return {
    ...asRecord(existingOriginalData),
    Source: 'GAP registration form',
    'Import Source': 'gmail_mbox',
    'Message-ID': lead.messageId,
    'IC Number': lead.icNumber,
    'Submitted At': lead.submittedAt,
    'Dealer Email': dealerEmail,
  }
}

function buildGapSegmentAttributes(existingSegmentAttributes?: unknown): Record<string, unknown> {
  return {
    ...asRecord(existingSegmentAttributes),
    source: 'google_ads',
    acquisition_source: 'google_ads',
    channel: 'online',
  }
}

export type ImportGapMboxSummary = {
  totalMessages: number
  parsedGapLeads: number
  inserted: number
  updated: number
  skippedDuplicate: number
  skippedAlreadyImported: number
  skippedNoParticipant: number
  skippedInvalid: number
  skippedNonGap: number
  unmatchedDealers: Array<{ dealerEmail: string; count: number }>
  byParticipant: Array<{
    participantId: string
    displayName: string
    email: string
    inserted: number
    updated: number
    skippedDuplicate: number
    skippedAlreadyImported: number
  }>
}

type ParticipantLookup = {
  participantId: string
  userId: string
  email: string
  displayName: string
}

type ExistingCustomerRef = {
  id: string
  userId: string
  originalData: unknown
  segmentAttributes: unknown
  isGapLead: boolean
}

async function loadParticipantLookup(admin: SupabaseClient): Promise<Map<string, ParticipantLookup>> {
  const { data: participants, error } = await admin
    .from('google_ads_participants')
    .select('id, user_id, public_username')
    .order('created_at', { ascending: true })

  if (error) throw error

  const rows = participants || []
  const userIds = rows.map((p) => p.user_id)
  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((usersResult.data?.users || []).map((u) => [u.id, u.email || null]))

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name as string | null]))

  const lookup = new Map<string, ParticipantLookup>()
  for (const p of rows) {
    const email = emailById.get(p.user_id)
    if (!email) continue
    const key = email.trim().toLowerCase()
    const displayName =
      p.public_username?.trim() ||
      nameById.get(p.user_id)?.trim() ||
      email.split('@')[0] ||
      'Participant'

    lookup.set(key, {
      participantId: p.id,
      userId: p.user_id,
      email: key,
      displayName,
    })
  }

  return lookup
}

async function loadExistingCustomers(
  admin: SupabaseClient,
  userIds: string[]
): Promise<{
  byEmailKey: Map<string, ExistingCustomerRef>
  byPhoneKey: Map<string, ExistingCustomerRef>
  messageIds: Set<string>
}> {
  const byEmailKey = new Map<string, ExistingCustomerRef>()
  const byPhoneKey = new Map<string, ExistingCustomerRef>()
  const messageIds = new Set<string>()

  if (userIds.length === 0) {
    return { byEmailKey, byPhoneKey, messageIds }
  }

  const pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await admin
      .from('customers')
      .select('id, user_id, email_normalized, phone_e164, original_data, segment_attributes')
      .in('user_id', userIds)
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = data || []
    if (batch.length === 0) break

    for (const row of batch) {
      const userId = row.user_id as string
      const ref: ExistingCustomerRef = {
        id: row.id as string,
        userId,
        originalData: row.original_data,
        segmentAttributes: row.segment_attributes,
        isGapLead: isGapFormLead(row.original_data, row.segment_attributes),
      }

      const emailNorm = row.email_normalized as string | null
      const phoneE164 = row.phone_e164 as string | null
      if (emailNorm) byEmailKey.set(`${userId}:${emailNorm}`, ref)
      if (phoneE164) byPhoneKey.set(`${userId}:${phoneE164}`, ref)

      const mid = messageIdFromOriginalData(row.original_data)
      if (mid) messageIds.add(mid)
    }

    if (batch.length < pageSize) break
    offset += pageSize
  }

  return { byEmailKey, byPhoneKey, messageIds }
}

function leadDedupeKey(lead: ParsedGapMboxLead, userId: string): string | null {
  const email = normalizeEmail(lead.email)
  if (email) return `email:${userId}:${email}`
  const phone = normalizePhone(lead.phone)
  if (phone) return `phone:${userId}:${phone}`
  return null
}

function findExistingCustomer(
  existing: {
    byEmailKey: Map<string, ExistingCustomerRef>
    byPhoneKey: Map<string, ExistingCustomerRef>
  },
  userId: string,
  emailNorm: string,
  phoneNorm: string
): ExistingCustomerRef | null {
  if (emailNorm) {
    const byEmail = existing.byEmailKey.get(`${userId}:${emailNorm}`)
    if (byEmail) return byEmail
  }
  if (phoneNorm) {
    const byPhone = existing.byPhoneKey.get(`${userId}:${phoneNorm}`)
    if (byPhone) return byPhone
  }
  return null
}

export async function importGapMboxLeads(
  admin: SupabaseClient,
  mboxContent: string
): Promise<ImportGapMboxSummary> {
  const parsed = parseGapMbox(mboxContent)
  const participantByEmail = await loadParticipantLookup(admin)
  const userIds = [...new Set([...participantByEmail.values()].map((p) => p.userId))]
  const existing = await loadExistingCustomers(admin, userIds)

  const batchKeys = new Set<string>()
  const unmatchedCounts = new Map<string, number>()
  const participantStats = new Map<
    string,
    {
      participantId: string
      displayName: string
      email: string
      inserted: number
      updated: number
      skippedDuplicate: number
      skippedAlreadyImported: number
    }
  >()

  let inserted = 0
  let updated = 0
  let skippedDuplicate = 0
  let skippedAlreadyImported = 0
  let skippedNoParticipant = 0

  for (const lead of parsed.gapLeads) {
    const participant = participantByEmail.get(lead.dealerEmail ?? '')
    if (!participant) {
      skippedNoParticipant += 1
      const dealerEmail = lead.dealerEmail ?? 'unknown'
      unmatchedCounts.set(dealerEmail, (unmatchedCounts.get(dealerEmail) || 0) + 1)
      continue
    }

    if (!participantStats.has(participant.participantId)) {
      participantStats.set(participant.participantId, {
        participantId: participant.participantId,
        displayName: participant.displayName,
        email: participant.email,
        inserted: 0,
        updated: 0,
        skippedDuplicate: 0,
        skippedAlreadyImported: 0,
      })
    }
    const stats = participantStats.get(participant.participantId)!

    if (lead.messageId && existing.messageIds.has(lead.messageId)) {
      skippedAlreadyImported += 1
      stats.skippedAlreadyImported += 1
      continue
    }

    const dedupeKey = leadDedupeKey(lead, participant.userId)
    if (dedupeKey && batchKeys.has(dedupeKey)) {
      skippedDuplicate += 1
      stats.skippedDuplicate += 1
      continue
    }

    const emailNorm = normalizeEmail(lead.email)
    const phoneNorm = normalizePhone(lead.phone)
    const existingCustomer = findExistingCustomer(existing, participant.userId, emailNorm, phoneNorm)

    if (existingCustomer) {
      if (existingCustomer.isGapLead) {
        skippedDuplicate += 1
        stats.skippedDuplicate += 1
        continue
      }

      const { error: updateErr } = await admin
        .from('customers')
        .update({
          name: lead.name || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          location: lead.location || undefined,
          segment_attributes: buildGapSegmentAttributes(existingCustomer.segmentAttributes),
          original_data: buildGapOriginalData(lead, participant.email, existingCustomer.originalData),
          last_synced_at: lead.submittedAt,
        })
        .eq('id', existingCustomer.id)

      if (updateErr) throw new Error(updateErr.message)

      updated += 1
      stats.updated += 1
      existingCustomer.isGapLead = true
      existingCustomer.originalData = buildGapOriginalData(lead, participant.email, existingCustomer.originalData)
      if (lead.messageId) existing.messageIds.add(lead.messageId)
      if (dedupeKey) batchKeys.add(dedupeKey)
      continue
    }

    const submittedAt = lead.submittedAt
    const { error: insertErr } = await admin.from('customers').insert({
      user_id: participant.userId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      location: lead.location,
      segment_attributes: buildGapSegmentAttributes(),
      original_data: buildGapOriginalData(lead, participant.email),
      last_synced_at: submittedAt,
      created_at: submittedAt,
    })

    if (insertErr) {
      throw new Error(insertErr.message)
    }

    inserted += 1
    stats.inserted += 1

    if (dedupeKey) batchKeys.add(dedupeKey)
    if (emailNorm) {
      existing.byEmailKey.set(`${participant.userId}:${emailNorm}`, {
        id: 'pending',
        userId: participant.userId,
        originalData: buildGapOriginalData(lead, participant.email),
        segmentAttributes: buildGapSegmentAttributes(),
        isGapLead: true,
      })
    }
    if (phoneNorm) {
      existing.byPhoneKey.set(`${participant.userId}:${phoneNorm}`, {
        id: 'pending',
        userId: participant.userId,
        originalData: buildGapOriginalData(lead, participant.email),
        segmentAttributes: buildGapSegmentAttributes(),
        isGapLead: true,
      })
    }
    if (lead.messageId) existing.messageIds.add(lead.messageId)
  }

  const unmatchedDealers = [...unmatchedCounts.entries()]
    .map(([dealerEmail, count]) => ({ dealerEmail, count }))
    .sort((a, b) => b.count - a.count || a.dealerEmail.localeCompare(b.dealerEmail))

  const byParticipant = [...participantStats.values()]
    .filter(
      (p) =>
        p.inserted > 0 ||
        p.updated > 0 ||
        p.skippedDuplicate > 0 ||
        p.skippedAlreadyImported > 0
    )
    .sort((a, b) => b.inserted + b.updated - (a.inserted + a.updated) || a.displayName.localeCompare(b.displayName))

  return {
    totalMessages: parsed.totalMessages,
    parsedGapLeads: parsed.gapLeads.length,
    inserted,
    updated,
    skippedDuplicate,
    skippedAlreadyImported,
    skippedNoParticipant,
    skippedInvalid: parsed.skippedInvalid,
    skippedNonGap: parsed.skippedNonGap,
    unmatchedDealers,
    byParticipant,
  }
}
