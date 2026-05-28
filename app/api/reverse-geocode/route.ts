import { NextResponse } from 'next/server'

function formatNominatimAddress(address: Record<string, string | undefined>): string | null {
  const place =
    address.town ||
    address.city ||
    address.municipality ||
    address.city_district ||
    address.suburb ||
    address.village ||
    address.county
  const state = address.state
  const country = address.country
  const label = [place, state, country].filter(Boolean).join(', ')
  return label || null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=14`,
      {
        headers: {
          'User-Agent': 'CRMPG/1.0 (lucky-draw location)',
          'Accept-Language': 'en',
        },
      }
    )

    if (nomRes.ok) {
      const data = (await nomRes.json()) as { address?: Record<string, string | undefined> }
      if (data.address) {
        const label = formatNominatimAddress(data.address)
        if (label) return NextResponse.json({ label })
      }
    }
  } catch {
    // fall through
  }

  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    )
    if (bdcRes.ok) {
      const data = (await bdcRes.json()) as {
        locality?: string
        city?: string
        principalSubdivision?: string
        countryName?: string
      }
      const place = data.locality || data.city
      if (place && data.principalSubdivision) {
        const label = [place, data.principalSubdivision, data.countryName].filter(Boolean).join(', ')
        return NextResponse.json({ label })
      }
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ label: `${lat.toFixed(6)}, ${lng.toFixed(6)}` })
}
