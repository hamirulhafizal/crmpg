'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function ViewTransitionsInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if view transitions are supported
    if (typeof document === 'undefined' || !('startViewTransition' in document)) {
      return
    }

    // Apply view transition when route changes
    // The CSS in globals.css will handle the cross-fade animation
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        // Transition is handled automatically by CSS
        // This ensures the browser knows to animate the change
      })
    }
  }, [pathname, searchParams])

  return null
}

export default function ViewTransitions() {
  return (
    <Suspense fallback={null}>
      <ViewTransitionsInner />
    </Suspense>
  )
}

