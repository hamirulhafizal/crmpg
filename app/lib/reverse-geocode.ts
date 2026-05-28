/** Reverse geocode coordinates to a human-readable address (Malaysia-friendly). */
export async function reverseGeocodeLatLng(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const response = await fetch(
      `/api/reverse-geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`
    )
    if (!response.ok) throw new Error('Reverse geocoding failed')
    const data = (await response.json()) as { label?: string }
    if (data.label) return data.label
  } catch {
    // fall through
  }
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}

/** Parse "lat, lng" or "lng, lat" style strings from stored location. */
export function parseLatLngFromLocation(value: string): { lat: number; lng: number } | null {
  const match = value.trim().match(/(-?\d+(?:\.\d+)?)\s*[,]\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const a = Number(match[1])
  const b = Number(match[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // Malaysia: lat ~0–7, lng ~99–120
  if (a >= 40 && b < 40) return { lng: a, lat: b }
  if (b >= 40 && a < 40) return { lng: b, lat: a }
  return { lat: a, lng: b }
}

export type GeolocationRequestOptions = {
  /** When true, never reuse a cached device position (recommended for Locate me). */
  fresh?: boolean
}

export function getCurrentPosition(options?: GeolocationRequestOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: options?.fresh ? 25000 : 15000,
      maximumAge: options?.fresh ? 0 : 120000,
    })
  })
}

export function geolocationErrorMessage(error: unknown): string {
  if (error instanceof GeolocationPositionError) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location access denied. Enable location in your browser settings, or tap Map to pick your town.'
      case error.POSITION_UNAVAILABLE:
        return 'Location unavailable. Try again outdoors or tap Map to pick Kluang manually.'
      case error.TIMEOUT:
        return 'Location request timed out. Try again or tap Map to pick your town.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Could not get your location. Tap Map to pick your town manually.'
}

export function formatLocationAccuracyMeters(accuracy: number | undefined): string | null {
  if (accuracy == null || !Number.isFinite(accuracy)) return null
  if (accuracy >= 5000) return 'Very approximate — use Map to pick your exact town.'
  if (accuracy >= 1500) return 'Approximate area — tap Locate me again or use Map if this is wrong.'
  if (accuracy >= 500) return `Within ~${Math.round(accuracy)} m`
  return `Accurate to ~${Math.round(accuracy)} m`
}
