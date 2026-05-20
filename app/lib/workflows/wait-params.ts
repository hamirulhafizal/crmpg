import { defaultParametersForType } from '@/app/lib/workflows/catalog'

export type WaitRangeSeconds = {
  minSeconds: number
  maxSeconds: number
}

/** UI presets — labels map to seconds stored on the wait node (not used by the engine directly). */
export const WAIT_RANGE_PRESETS: ReadonlyArray<{
  id: string
  label: string
  minSeconds: number
  maxSeconds: number
}> = [
  { id: '30s-1m', label: '30s – 1 min', minSeconds: 30, maxSeconds: 60 },
  { id: '1-2m', label: '1 – 2 min', minSeconds: 60, maxSeconds: 120 },
  { id: '2-5m', label: '2 – 5 min', minSeconds: 120, maxSeconds: 300 },
  { id: '5-10m', label: '5 – 10 min', minSeconds: 300, maxSeconds: 600 },
]

function finiteSeconds(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/** Random integer seconds in [min, max] inclusive. */
export function pickWaitSeconds(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(0, Math.floor(Number(minSeconds) || 0))
  const max = Math.max(min, Math.floor(Number(maxSeconds) || min))
  if (max === min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Read wait bounds from node parameters (falls back to catalog defaults for new nodes). */
export function normalizeWaitParams(params: Record<string, unknown> | null | undefined): WaitRangeSeconds {
  const defaults = defaultParametersForType('crm.flow.wait')
  const defMin = finiteSeconds(defaults.wait_min_seconds, 60)
  const defMax = finiteSeconds(defaults.wait_max_seconds, 120)
  const minSeconds = finiteSeconds(params?.wait_min_seconds, defMin)
  const maxSeconds = Math.max(minSeconds, finiteSeconds(params?.wait_max_seconds, defMax))
  return { minSeconds, maxSeconds }
}

export function minutesToSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return 0
  return Math.max(0, Math.round(minutes * 60))
}

export function secondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.round((seconds / 60) * 100) / 100
}

/** Human label for canvas / logs, e.g. "1–2 min" or "45s". */
export function formatWaitRangeLabel(minSeconds: number, maxSeconds: number): string {
  const min = Math.max(0, Math.floor(minSeconds))
  const max = Math.max(min, Math.floor(maxSeconds))
  if (max === 0) return 'no wait'
  if (min === max) return formatDurationSeconds(min)
  return `${formatDurationSeconds(min)} – ${formatDurationSeconds(max)}`
}

function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = totalSeconds / 60
  if (totalSeconds % 60 === 0) return `${minutes} min`
  if (totalSeconds % 30 === 0) return `${minutes} min`
  return `${Math.round(minutes * 10) / 10} min`
}

export function waitParamsFromPreset(presetId: string): WaitRangeSeconds | null {
  const preset = WAIT_RANGE_PRESETS.find((p) => p.id === presetId)
  if (!preset) return null
  return { minSeconds: preset.minSeconds, maxSeconds: preset.maxSeconds }
}

export function activeWaitPresetId(minSeconds: number, maxSeconds: number): string | null {
  const match = WAIT_RANGE_PRESETS.find(
    (p) => p.minSeconds === minSeconds && p.maxSeconds === maxSeconds
  )
  return match?.id ?? null
}
