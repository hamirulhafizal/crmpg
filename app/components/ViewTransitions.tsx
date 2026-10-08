'use client'

/**
 * Previously called document.startViewTransition() with an empty callback on every
 * route change. That races React's own DOM updates and can leave ::view-transition-old
 * snapshots stuck on screen (double headers / ghost sidebars) — especially after
 * account switch hard navigations.
 *
 * Next.js App Router handles transitions; keep this as a no-op stub so existing
 * imports in root layout stay valid.
 */
export default function ViewTransitions() {
  return null
}
