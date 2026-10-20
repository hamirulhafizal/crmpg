import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { HomeBrandIcon } from './home-brand-icon'

export const metadata: Metadata = {
  title: 'Public Gold Malaysia',
  description: 'Public Gold Malaysia',
  icons: {
    icon: [
      { url: '/pg-favicon.png?v=20261020', type: 'image/png', sizes: '32x32' },
      { url: '/pg-favicon.png?v=20261020', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/pg-favicon.png?v=20261020', type: 'image/png', sizes: '180x180' }],
    shortcut: '/pg-favicon.png?v=20261020',
  },
}

export default function PublicHomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HomeBrandIcon />
      {children}
    </>
  )
}
