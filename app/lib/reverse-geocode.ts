/** Reverse geocode coordinates to a human-readable address (Malaysia-friendly). */
export async function reverseGeocodeLatLng(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    )
    if (!response.ok) throw new Error('Reverse geocoding failed')
    const data = (await response.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
      countryName?: string
    }
    const city = data.city || data.locality
    if (city && data.principalSubdivision) {
      return [city, data.principalSubdivision, data.countryName].filter(Boolean).join(', ')
    }
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

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 120000,
    })
  })
}

export function geolocationErrorMessage(error: unknown): string {
  if (error instanceof GeolocationPositionError) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location access denied. Enable location in your browser settings, or tap the map to pick a spot.'
      case error.POSITION_UNAVAILABLE:
        return 'Location unavailable. Try again or tap the map to pick a spot.'
      case error.TIMEOUT:
        return 'Location request timed out. Try again or tap the map to pick a spot.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Could not get your location. Try again or tap the map to pick a spot.'
}
