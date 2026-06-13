export class WhatsAppApiError extends Error {
  status: number
  path: string
  provider: 'waha' | 'wasender'
  attempts?: Array<{ path: string; status: number; message: string }>

  constructor(
    message: string,
    status: number,
    path: string,
    provider: 'waha' | 'wasender',
    attempts?: Array<{ path: string; status: number; message: string }>
  ) {
    super(message)
    this.name = 'WhatsAppApiError'
    this.status = status
    this.path = path
    this.provider = provider
    if (attempts?.length) this.attempts = attempts
  }
}

/** @deprecated Use WhatsAppApiError */
export { WhatsAppApiError as WahaApiError }
