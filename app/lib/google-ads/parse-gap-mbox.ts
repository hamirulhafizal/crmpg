export type ParsedGapMboxLead = {
  messageId: string | null
  submittedAt: string
  name: string | null
  email: string | null
  icNumber: string | null
  phone: string | null
  location: string | null
  dealerEmail: string | null
}

export type ParseGapMboxResult = {
  totalMessages: number
  gapLeads: ParsedGapMboxLead[]
  skippedNonGap: number
  skippedInvalid: number
}

function normalizeMboxContent(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
}

function splitMboxMessages(content: string): string[] {
  const normalized = normalizeMboxContent(content).trim()
  if (!normalized) return []
  return normalized.split(/\n(?=From )/)
}

function parseHeaderBlock(block: string): { headers: Record<string, string>; body: string } {
  const separator = block.indexOf('\n\n')
  if (separator === -1) return { headers: {}, body: block }

  const headerLines = block.slice(0, separator).split('\n')
  const body = block.slice(separator + 2)

  const unfolded: string[] = []
  for (const line of headerLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`
    } else {
      unfolded.push(line)
    }
  }

  const headers: Record<string, string> = {}
  for (const line of unfolded) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    headers[key] = value
  }

  return { headers, body }
}

function parseEmailDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function extractEmailAddress(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const angle = raw.match(/<([^>]+)>/)
  if (angle?.[1]) return angle[1].trim().toLowerCase()
  const plain = raw.trim().toLowerCase()
  return plain.includes('@') ? plain : null
}

function readBodyField(body: string, label: string): string | null {
  const re = new RegExp(`^${label}:\\s*(.+)$`, 'im')
  const match = body.match(re)
  return match?.[1]?.trim() || null
}

function parseGapLeadFromJsonBody(body: string): Omit<ParsedGapMboxLead, 'messageId' | 'submittedAt'> | null {
  const jsonStart = body.indexOf('{')
  const jsonEnd = body.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null

  try {
    const parsed = JSON.parse(body.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>
    const dealerEmail = extractEmailAddress(String(parsed.dealerEmail ?? ''))
    const name = typeof parsed.fullName === 'string' ? parsed.fullName.trim() : null
    const email = typeof parsed.email === 'string' ? parsed.email.trim() : null
    const icNumber = typeof parsed.icNumber === 'string' ? parsed.icNumber.trim() : null
    const phone = parsed.phone != null ? String(parsed.phone).trim() : null
    const location = typeof parsed.location === 'string' ? parsed.location.trim() : null

    if (!dealerEmail) return null
    if (!name && !email && !phone) return null

    return {
      name,
      email,
      icNumber,
      phone,
      location,
      dealerEmail,
    }
  } catch {
    return null
  }
}

function isGapRegistrationBody(body: string, subject: string | null): boolean {
  if (/new gap registration/i.test(subject ?? '')) return true
  return /new gap registration received|new registration received/i.test(body)
}

function parseGapLeadFromMessage(block: string): ParsedGapMboxLead | null {
  const { headers, body } = parseHeaderBlock(block)
  const subject = headers.subject ?? null

  if (!isGapRegistrationBody(body, subject)) return null

  const jsonLead = parseGapLeadFromJsonBody(body)
  if (jsonLead) {
    const messageId = headers['message-id']?.replace(/^<|>$/g, '') || null
    const submittedAt = parseEmailDate(headers.date)?.toISOString() ?? new Date(0).toISOString()
    return { ...jsonLead, messageId, submittedAt }
  }

  const name = readBodyField(body, 'Name')
  const email = readBodyField(body, 'Email')
  const icNumber = readBodyField(body, 'IC')
  const phone = readBodyField(body, 'Phone')
  const location = readBodyField(body, 'Location')
  const dealerEmail =
    readBodyField(body, 'For Dealer') ||
    extractEmailAddress(headers.to) ||
    extractEmailAddress(headers['for'])

  if (!dealerEmail) return null
  if (!name && !email && !phone) return null

  const messageId = headers['message-id']?.replace(/^<|>$/g, '') || null
  const submittedAt = parseEmailDate(headers.date)?.toISOString() ?? new Date(0).toISOString()

  return {
    messageId,
    submittedAt,
    name,
    email,
    icNumber,
    phone,
    location,
    dealerEmail: dealerEmail.toLowerCase(),
  }
}

export function parseGapMbox(content: string): ParseGapMboxResult {
  const messages = splitMboxMessages(content)
  const gapLeads: ParsedGapMboxLead[] = []
  let skippedNonGap = 0
  let skippedInvalid = 0

  for (const block of messages) {
    const lead = parseGapLeadFromMessage(block)
    if (!lead) {
      const { headers, body } = parseHeaderBlock(block)
      if (isGapRegistrationBody(body, headers.subject ?? null)) {
        skippedInvalid += 1
      } else {
        skippedNonGap += 1
      }
      continue
    }
    gapLeads.push(lead)
  }

  return {
    totalMessages: messages.length,
    gapLeads,
    skippedNonGap,
    skippedInvalid,
  }
}
