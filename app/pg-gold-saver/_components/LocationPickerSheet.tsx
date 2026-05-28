'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Locate, MapPin, X } from 'lucide-react'
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
  parseLatLngFromLocation,
  reverseGeocodeLatLng,
} from '@/app/lib/reverse-geocode'

type Coords = { lng: number; lat: number }

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

type LocationPickerSheetProps = {
  open: boolean
  initialLocation?: string
  onClose: () => void
  onConfirm: (location: string, coords?: { lat: number; lng: number }) => void
}

export default function LocationPickerSheet({
  open,
  initialLocation = '',
  onClose,
  onConfirm,
}: LocationPickerSheetProps) {
  const [marker, setMarker] = useState<Coords | null>(null)
  const [preview, setPreview] = useState('')
  const [resolving, setResolving] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [locatingOnOpen, setLocatingOnOpen] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const openedRef = useRef(false)
  const [recenterTarget, setRecenterTarget] = useState<Coords | null>(null)

  const resolveAddress = useCallback(async (coords: Coords) => {
    setResolving(true)
    try {
      const label = await reverseGeocodeLatLng(coords.lat, coords.lng)
      setPreview(label)
      return label
    } finally {
      setResolving(false)
    }
  }, [])

  const applyCoords = useCallback(
    async (coords: Coords, applyToField: boolean, recenter = false) => {
      setMarker(coords)
      setGeoError(null)
      if (recenter) setRecenterTarget(coords)
      const label = await resolveAddress(coords)
      if (applyToField) onConfirm(label, { lat: coords.lat, lng: coords.lng })
      return label
    },
    [onConfirm, resolveAddress]
  )

  const trackMyLocation = useCallback(
    async (applyAndClose: boolean) => {
      setTracking(true)
      setGeoError(null)
      try {
        const position = await getCurrentPosition({ fresh: true })
        const coords = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
        }
        const label = await applyCoords(coords, applyAndClose, true)
        if (applyAndClose) onClose()
        return label
      } catch (error) {
        setGeoError(geolocationErrorMessage(error))
        return null
      } finally {
        setTracking(false)
      }
    },
    [applyCoords, onClose]
  )

  useEffect(() => {
    if (!open) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true

    setGeoError(null)
    setPreview(initialLocation.trim())
    setMarker(null)
    setRecenterTarget(null)

    const parsed = parseLatLngFromLocation(initialLocation)

    setLocatingOnOpen(true)
    void (async () => {
      try {
        const position = await getCurrentPosition({ fresh: true })
        await applyCoords(
          {
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          },
          false,
          true
        )
      } catch (error) {
        if (parsed) {
          await applyCoords({ lng: parsed.lng, lat: parsed.lat }, false, true)
        } else {
          setGeoError(geolocationErrorMessage(error))
        }
      } finally {
        setLocatingOnOpen(false)
      }
    })()
  }, [open, initialLocation, applyCoords])

  const handlePick = useCallback(
    (coords: Coords, resolve = true, applyToField = false) => {
      setMarker(coords)
      setGeoError(null)
      if (resolve) void applyCoords(coords, applyToField)
    },
    [applyCoords]
  )

  const handleLocateControl = useCallback(
    (coords: { longitude: number; latitude: number }) => {
      void applyCoords({ lng: coords.longitude, lat: coords.latitude }, true, true)
    },
    [applyCoords]
  )

  const confirmSelection = useCallback(async () => {
    if (!marker || !preview.trim()) return
    onConfirm(preview.trim(), { lat: marker.lat, lng: marker.lng })
    onClose()
  }, [marker, preview, onConfirm, onClose])

  if (!open) return null

  const mapBusy = locatingOnOpen || tracking

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/40 p-0 sm:items-end sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-picker-title"
    >
      <div className="mt-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:mt-0 sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="location-picker-title" className="text-base font-semibold text-slate-900">
              Pick your location
            </h2>
            <p className="text-xs text-slate-500">We use your device location by default</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative h-[min(52vh,420px)] min-h-[280px] w-full shrink-0">
          {marker ? (
            <Map center={[marker.lng, marker.lat]} zoom={14} className="h-full w-full">
              <MapRecenter target={recenterTarget} />
              <MapClickToPlace onPick={(c) => handlePick(c, true, true)} />
              <MapControls showZoom showLocate onLocate={handleLocateControl} position="top-right" />
              <MapMarker
                draggable
                longitude={marker.lng}
                latitude={marker.lat}
                onDrag={(lngLat) => handlePick({ lng: lngLat.lng, lat: lngLat.lat }, false, false)}
                onDragEnd={(lngLat) => handlePick({ lng: lngLat.lng, lat: lngLat.lat }, true, true)}
              >
                <MarkerContent>
                  <div className="cursor-move drop-shadow-md">
                    <MapPin className="fill-amber-600 stroke-white" size={32} strokeWidth={1.5} />
                  </div>
                </MarkerContent>
              </MapMarker>
            </Map>
          ) : (
            <div className="flex h-full items-center justify-center bg-slate-100">
              <p className="px-6 text-center text-sm text-slate-500">
                {locatingOnOpen ? 'Getting your location…' : 'Allow location access or tap Track my location'}
              </p>
            </div>
          )}

          {mapBusy && marker && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                Locating…
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            {resolving ? (
              <span className="text-slate-400">Looking up address…</span>
            ) : (
              preview || 'Your address will appear here'
            )}
          </div>

          {geoError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              {geoError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void trackMyLocation(false)}
              disabled={tracking || resolving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              <Locate className="size-4" aria-hidden />
              {tracking ? 'Locating…' : 'Locate me'}
            </button>
            <button
              type="button"
              onClick={() => void confirmSelection()}
              disabled={!marker || !preview.trim() || resolving}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              Use this location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
