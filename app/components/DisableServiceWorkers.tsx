'use client'

import { useEffect } from 'react'

export default function DisableServiceWorkers() {
  useEffect(() => {
    const cleanupServiceWorkers = async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      } catch (error) {
        console.error('Failed to unregister service workers:', error)
      }

      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map((name) => caches.delete(name)))
        } catch (error) {
          console.error('Failed to clear service worker caches:', error)
        }
      }
    }

    void cleanupServiceWorkers()
  }, [])

  return null
}
