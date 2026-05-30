import type { LuckyDrawPrize } from '@/app/lib/lucky-draw/types'

export function normalizePrizes(raw: unknown): LuckyDrawPrize[] {
  if (!Array.isArray(raw)) return []
  const prizes: LuckyDrawPrize[] = []

  for (const item of raw) {
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!name) continue

    const prize: LuckyDrawPrize = { name }
    if (typeof row.description === 'string' && row.description.trim()) {
      prize.description = row.description.trim()
    }
    prizes.push(prize)
  }

  return prizes
}
