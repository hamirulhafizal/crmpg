/** Anti-spam helpers shared by campaigns and automation sends. */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function randomDelayBetween(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  await sleep(delay)
}

/** Conservative text variation to reduce identical-looking automation. */
export function humanizeWhatsAppText(input: string): string {
  const extraSpaceBetweenWordsProbability = 0.25

  let text = input.replace(/(\S) (\S)/g, (match, a: string, b: string) => {
    const twoSpaces = Math.random() < extraSpaceBetweenWordsProbability
    return `${a}${twoSpaces ? '  ' : ' '}${b}`
  })

  const extendDoubleProbability = 0.12
  const extendTripleProbability = 0.03

  text = text.replace(/(?<!\.)(\.)(?!\.)(\s*($|\n))/g, (match, dot: string, ws: string) => {
    const r = Math.random()
    if (r < extendTripleProbability) return `${dot}..${ws}`
    if (r < extendDoubleProbability + extendTripleProbability) return `${dot}.${ws}`
    return match
  })

  return text
}

export function isTypingChatNotFoundError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)
  return message.toLowerCase().includes('chat not found')
}

export function typingDelayBounds(textLength: number): { minMs: number; maxMs: number } {
  const baseDelayMs = 900
  const perCharExtraMs = 6
  const maxDelayMs = 2600
  const computed = baseDelayMs + Math.min(textLength, 250) * perCharExtraMs
  const typingDelayMs = Math.max(baseDelayMs, Math.min(maxDelayMs, computed))
  const minMs = Math.max(400, Math.floor(typingDelayMs * 0.8))
  const maxMs = Math.max(minMs + 50, Math.floor(typingDelayMs * 1.1))
  return { minMs, maxMs }
}
