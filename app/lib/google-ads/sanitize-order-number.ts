/**
 * Bayarcash sometimes appends redirect params with a second `?` instead of `&`,
 * so `order_number` can be parsed as `GADS-xxx?payment_intent_id=...`. Strip anything after `?` or `&`.
 */
export function sanitizeCrmOrderNumber(raw: string | null | undefined): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const cut = s.split(/[?&]/)[0]
  return (cut ?? '').trim()
}
