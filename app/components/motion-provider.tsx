'use client'

import { MotionConfig } from 'framer-motion'

/**
 * Global Framer Motion defaults: honour prefers-reduced-motion for accessibility.
 * Wrap app content so all motion.* components inherit this config.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
