'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Locate, MapPin } from 'lucide-react'
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  useMap,
} from '@/components/ui/map'
import {
  geolocationErrorMessage,
  getCurrentPosition,
  reverseGeocodeLatLng,
} from '@/app/lib/reverse-geocode'

type Coords = { lng: number; lat: number }

const DEFAULT_CENTER: Coords = { lng: 103.3179, lat: 2.0301 } // Kluang, Johor
const DEFAULT_ZOOM = 11

function MapClickToPlace({ onPick }: { onPick: (coords: Coords) => void }) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!map || !isLoaded) return
    const handler = (e: { lngLat: { lng: number; lat: number } }) => {
      onPick({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    }
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [map, isLoaded, onPick])

  return null
}

function MapRecenter({ target }: { target: Coords | null }) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!map || !isLoaded || !target) return
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: 14,
      duration: 900,
    })
  }, [map, isLoaded, target])

  return null
}

export type InlineLocationMapProps = {
  lat: number | null
  lng: number | null
  locating?: boolean
  onLocatingChange?: (locating: boolean) => void
  onLocationPick: (coords: Coords, label: string, accuracy?: number | null) => void
  onError?: (message: string) => void
}

export function InlineLocationMap({
  lat,
  lng,
  locating = false,
  onLocatingChange,
  onLocationPick,
  onError,
}: InlineLocationMapProps) {
  const [marker, setMarker] = useState<Coords | null>(
    lat != null && lng != null ? { lat, lng } : null
  )
  const [resolving, setResolving] = useState(false)
  const [recenterTarget, setRecenterTarget] = useState<Coords | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (lat != null && lng != null) {
      setMarker({ lat, lng })
    }
  }, [lat, lng])

  useEffect(() => {
    if (initializedRef.current || marker) return
    initializedRef.current = true
    setRecenterTarget(DEFAULT_CENTER)
  }, [marker])

  const applyCoords = useCallback(
    async (coords: Coords, recenter = false, accuracy?: number | null) => {
      setMarker(coords)
      if (recenter) setRecenterTarget(coords)
      setResolving(true)
      try {
        const label = await reverseGeocodeLatLng(coords.lat, coords.lng)
        onLocationPick(coords, label, accuracy ?? null)
      } catch {
        onError?.('Could not look up address for this point.')
      } finally {
        setResolving(false)
      }
    },
    [onLocationPick, onError]
  )

  const handleLocateMe = useCallback(async () => {
    onLocatingChange?.(true)
    onError?.('')
    try {
      const position = await getCurrentPosition({ fresh: true })
      await applyCoords(
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        true,
        position.coords.accuracy ?? null
      )
    } catch (e) {
      onError?.(geolocationErrorMessage(e))
    } finally {
      onLocatingChange?.(false)
    }
  }, [applyCoords, onError, onLocatingChange])

  const handleMapPick = useCallback(
    (coords: Coords, apply = true) => {
      setMarker(coords)
      if (apply) void applyCoords(coords, false, null)
    },
    [applyCoords]
  )

  const handleLocateControl = useCallback(
    (coords: { longitude: number; latitude: number }) => {
      void applyCoords({ lng: coords.longitude, lat: coords.latitude }, true, null)
    },
    [applyCoords]
  )

  const mapCenter = marker ?? DEFAULT_CENTER
  const busy = locating || resolving

  return (
    <div className="space-y-3">
      <div className="relative h-[min(42vh,280px)] min-h-[220px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <Map center={[mapCenter.lng, mapCenter.lat]} zoom={marker ? 14 : DEFAULT_ZOOM} className="h-full w-full">
          <MapRecenter target={recenterTarget} />
          <MapClickToPlace onPick={(c) => handleMapPick(c, true)} />
          <MapControls showZoom showLocate onLocate={handleLocateControl} position="top-right" />
          {marker && (
            <MapMarker
              draggable
              longitude={marker.lng}
              latitude={marker.lat}
              onDragEnd={(lngLat) => handleMapPick({ lng: lngLat.lng, lat: lngLat.lat }, true)}
              onDrag={(lngLat) => setMarker({ lng: lngLat.lng, lat: lngLat.lat })}
            >
              <MarkerContent>
                <div className="cursor-move drop-shadow-md">
                  <MapPin className="fill-amber-600 stroke-white" size={32} strokeWidth={1.5} />
                </div>
              </MarkerContent>
            </MapMarker>
          )}
        </Map>

        {!marker && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <p className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              Tap the map to pin your town
            </p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
            <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
              {locating ? 'Locating…' : 'Looking up address…'}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleLocateMe()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        <Locate className="size-4" />
        {locating ? 'Locating…' : 'Locate me'}
      </button>
    </div>
  )
}
