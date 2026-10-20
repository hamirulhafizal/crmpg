'use client'

import { useEffect } from 'react'

const PG_ICON = '/pg-favicon.png?v=20261020'

/** Force the Public Gold mark on the homepage tab (overrides the CRM /icon). */
export function HomeBrandIcon() {
  useEffect(() => {
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach((node) => node.parentElement?.removeChild(node))

    const rels = ['icon', 'shortcut icon', 'apple-touch-icon'] as const
    for (const rel of rels) {
      const link = document.createElement('link')
      link.rel = rel
      link.type = 'image/png'
      link.href = PG_ICON
      document.head.appendChild(link)
    }
  }, [])

  return null
}
