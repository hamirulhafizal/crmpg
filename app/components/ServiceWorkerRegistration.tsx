'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isAppShellPath } from '@/app/lib/app-shell-routes'

export default function ServiceWorkerRegistration() {
  const pathname = usePathname() || '/'

  useEffect(() => {
    if (!isAppShellPath(pathname) && !pathname.startsWith('/admin')) return
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('Service Worker registered:', registration)
          
          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60 * 60 * 1000) // Check every hour
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })

      // Handle service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }
  }, [pathname])

  return null
}

