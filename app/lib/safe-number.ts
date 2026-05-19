/** Finite number for controlled inputs (avoids React NaN warning). */
export function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function safeInt(value: unknown, fallback: number, min = 0): number {
  return Math.max(min, Math.floor(safeNumber(value, fallback)))
}
