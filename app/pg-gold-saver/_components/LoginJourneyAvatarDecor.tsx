'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GOLD_JOURNEY_COMPLETE_AVATARS,
  type GoldJourneyAvatar,
} from '@/app/pg-gold-saver/_components/gold-journey-avatars'

function daySeed(): number {
  const d = new Date()
  return d.getFullYear() * 1000 + d.getMonth() * 40 + d.getDate()
}

function pickAvatars(count: number): GoldJourneyAvatar[] {
  const seed = daySeed()
  const copy = [...GOLD_JOURNEY_COMPLETE_AVATARS]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (seed * (i + 7) * 13) % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

function Face({
  avatar,
  sizeClass,
  className = '',
}: {
  avatar: GoldJourneyAvatar
  sizeClass: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-full ring-[3px] ring-white shadow-md ${avatar.tint} ${sizeClass} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatar.url}
        alt=""
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </span>
  )
}

/** Center social-proof strip — reliable on all breakpoints. */
export function LoginJourneyAvatarStrip() {
  const faces = useMemo(() => pickAvatars(5), [])
  const more = Math.max(12, GOLD_JOURNEY_COMPLETE_AVATARS.length + 8)

  return (
    <motion.div
      className="mb-7"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-amber-100/90 bg-white/70 px-4 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center pl-1">
          {faces.map((avatar, i) => (
            <motion.span
              key={avatar.id}
              className="relative"
              style={{ marginLeft: i === 0 ? 0 : -12, zIndex: faces.length - i }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.18 + i * 0.05, type: 'spring', stiffness: 320, damping: 22 }}
            >
              <Face avatar={avatar} sizeClass="h-11 w-11 sm:h-12 sm:w-12" />
            </motion.span>
          ))}
          <motion.span
            className="relative z-20 -ml-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-teal-500 text-xs font-bold text-white shadow-md ring-[3px] ring-white sm:h-12 sm:w-12"
            aria-hidden
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45, type: 'spring', stiffness: 320, damping: 22 }}
          >
            +{more}
          </motion.span>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-medium leading-snug text-slate-600 sm:text-xs">
            Anda tidak bersendirian — rakan-rakan sudah lengkapkan
          </p>
          <p className="mt-0.5 text-sm font-semibold text-amber-800">Gold Journey</p>
        </div>
      </div>
    </motion.div>
  )
}

function FloatingCluster({
  children,
  className,
  delay = 0,
  drift = 6,
}: {
  children: React.ReactNode
  className: string
  delay?: number
  drift?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -drift, 0],
      }}
      transition={{
        opacity: { duration: 0.5, delay },
        scale: { duration: 0.5, delay },
        y: { duration: 5.5 + delay, repeat: Infinity, ease: 'easeInOut', delay },
      }}
    >
      {children}
    </motion.div>
  )
}

/** Soft floating accents in the page corners (desktop only). */
export function LoginJourneyFloatingFaces() {
  const faces = useMemo(() => pickAvatars(6), [])

  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden>
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-amber-200/45 blur-3xl" />
      <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-orange-200/35 blur-3xl" />
      <div className="absolute left-1/3 top-0 h-40 w-40 rounded-full bg-teal-100/55 blur-3xl" />
      <div className="absolute bottom-10 right-1/3 h-48 w-48 rounded-full bg-rose-100/40 blur-3xl" />

      <FloatingCluster className="absolute left-[8%] top-[14%]" delay={0.1} drift={7}>
        <div className="relative h-[5.5rem] w-[5.5rem]">
          <span className="absolute left-0 top-0 h-2 w-2 rounded-full bg-teal-400" />
          <span className="absolute right-2 top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
          <Face avatar={faces[0]} sizeClass="h-14 w-14" className="absolute left-0 top-2" />
          <Face avatar={faces[1]} sizeClass="h-12 w-12" className="absolute bottom-0 right-0" />
        </div>
      </FloatingCluster>

      <FloatingCluster className="absolute right-[7%] top-[16%]" delay={0.25} drift={8}>
        <div className="relative h-28 w-28">
          <span className="absolute left-2 top-0 h-2 w-2 rounded-full bg-rose-400" />
          <span className="absolute right-4 top-3 h-1.5 w-1.5 rounded-full bg-orange-400" />
          <Face avatar={faces[2]} sizeClass="h-14 w-14" className="absolute left-5 top-0" />
          <Face avatar={faces[3]} sizeClass="h-11 w-11" className="absolute bottom-2 left-0" />
          <span className="absolute bottom-0 right-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold text-white shadow-md ring-[3px] ring-white">
            +{Math.max(8, GOLD_JOURNEY_COMPLETE_AVATARS.length)}
          </span>
        </div>
      </FloatingCluster>

      <FloatingCluster className="absolute bottom-[14%] left-[10%]" delay={0.35} drift={6}>
        <div className="relative h-24 w-24">
          <span className="absolute bottom-3 left-0 h-2 w-2 rounded-full bg-amber-400" />
          <Face avatar={faces[4]} sizeClass="h-14 w-14" className="absolute left-1 top-0" />
          <Face avatar={faces[5]} sizeClass="h-11 w-11" className="absolute bottom-0 right-0" />
        </div>
      </FloatingCluster>

      <FloatingCluster className="absolute bottom-[18%] right-[11%]" delay={0.2} drift={5}>
        <div className="relative">
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-teal-400" />
          <Face avatar={faces[0]} sizeClass="h-16 w-16 opacity-90" />
        </div>
      </FloatingCluster>
    </div>
  )
}
