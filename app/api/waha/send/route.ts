import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function randomDelayBetween(minMs: number, maxMs: number) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await sleep(delay)
}

function humanizeWhatsAppText(input: string): string {
  // Conservative "humanization" to reduce identical-looking automation.
  // - Add occasional extra spaces between words.
  // - Randomly vary sentence-ending '.' and sometimes include/remove a trailing '.'.
  const extraSpaceBetweenWordsProbability = 0.25
  let text = input.replace(/(\S) (\S)/g, (_match, a: string, b: string) => {
    const twoSpaces = Math.random() < extraSpaceBetweenWordsProbability
    return `${a}${twoSpaces ? '  ' : ' '}${b}`
  })

  // Extend sentence-ending single '.' into '..' or '...' sometimes.
  // This runs only for '.' not already part of '...' and followed by whitespace/end.
  const extendDoubleProbability = 0.12 // '.' -> '..'
  const extendTripleProbability = 0.03 // '.' -> '...'
  text = text.replace(/(\.)(?!\.)(\s*($|\n))/g, (match, dot: string, ws: string) => {
    const r = Math.random()
    if (r < extendTripleProbability) return `${dot}..${ws}`
    if (r < extendDoubleProbability + extendTripleProbability) return `${dot}.${ws}`
    return match
  })

  // Randomize trailing '.' at the end of the full message.
  // - If it ends with '.', sometimes remove it.
  // - If it doesn't end with '.', sometimes add it (only if it ends with a letter/number).
  const trailingDotRemoveProbability = 0.45
  const trailingDotAddProbability = 0.25
  const endsWithDot = text.endsWith('.')
  if (endsWithDot) {
    if (Math.random() < trailingDotRemoveProbability) {
      text = text.slice(0, -1)
    }
  } else {
    // Add a trailing '.' only when the message ends with a non-punctuation character.
    // (We avoid messing with '?' / '!' / ')' etc.)
    const lastChar = text[text.length - 1] || ''
    const isLikelyWordEnd = /[0-9A-Za-z]/.test(lastChar)
    if (isLikelyWordEnd && Math.random() < trailingDotAddProbability) {
      text = `${text}.`
    }
  }

  return text
}

// Normalize phone to WAHA chatId (e.g. 60184644305 -> 60184644305@c.us)
function toChatId(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '60' + digits.slice(1)
  else if (!digits.startsWith('60')) digits = '60' + digits
  return `${digits}@c.us`
}

// POST /api/waha/send - Send WhatsApp text message via WAHA
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const session = (body.session || '').toString().trim()
    const to = (body.to || body.phone || body.number || '').toString().trim()
    const text = (body.text || body.message || '').toString().trim()

    if (!session) {
      return NextResponse.json(
        { error: 'Session name is required (e.g. 60184644305)' },
        { status: 400 }
      )
    }
    if (!to) {
      return NextResponse.json(
        { error: 'Target phone number is required (e.g. 60123456789)' },
        { status: 400 }
      )
    }
    if (!text) {
      return NextResponse.json(
        { error: 'Message text is required' },
        { status: 400 }
      )
    }

    const chatId = toChatId(to)
    const humanText = humanizeWhatsAppText(text)

    // WAHA "human-like" typing indicators for the test message.
    // Keep these delays small so manual testing stays fast.
    const baseDelayMs = 700
    const perCharExtraMs = 6
    const maxDelayMs = 2200
    const computed = baseDelayMs + Math.min(humanText.length, 250) * perCharExtraMs
    const typingDelayMs = Math.max(baseDelayMs, Math.min(maxDelayMs, computed))
    const minTyping = Math.max(350, Math.floor(typingDelayMs * 0.8))
    const maxTyping = Math.max(minTyping + 50, Math.floor(typingDelayMs * 1.1))

    try {
      await wahaFetch('/api/startTyping', {
        method: 'POST',
        body: JSON.stringify({
          session,
          chatId,
        }),
      })
    } catch (e) {
      // If typing endpoints fail, still send the message.
      console.warn('startTyping failed; continuing with sendText:', e)
    }

    await randomDelayBetween(minTyping, maxTyping)

    try {
      await wahaFetch('/api/stopTyping', {
        method: 'POST',
        body: JSON.stringify({
          session,
          chatId,
        }),
      })
    } catch (e) {
      console.warn('stopTyping failed; continuing with sendText:', e)
    }

    const result = await wahaFetch<unknown>('/api/sendText', {
      method: 'POST',
      body: JSON.stringify({
        session,
        chatId,
        text: humanText,
      }),
    })

    return NextResponse.json({ success: true, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
