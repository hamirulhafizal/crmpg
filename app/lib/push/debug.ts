const PREFIX = '[PG Push]'

export function pushDebug(step: string, data?: unknown): void {
  if (typeof window === 'undefined') return
  if (data !== undefined) {
    console.log(`${PREFIX} ${step}`, data)
  } else {
    console.log(`${PREFIX} ${step}`)
  }
}

export function pushDebugWarn(step: string, data?: unknown): void {
  if (typeof window === 'undefined') return
  if (data !== undefined) {
    console.warn(`${PREFIX} ${step}`, data)
  } else {
    console.warn(`${PREFIX} ${step}`)
  }
}

export function pushDebugError(step: string, data?: unknown): void {
  if (typeof window === 'undefined') return
  if (data !== undefined) {
    console.error(`${PREFIX} ${step}`, data)
  } else {
    console.error(`${PREFIX} ${step}`)
  }
}
