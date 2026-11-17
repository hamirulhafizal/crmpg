'use client'

import { motion } from 'framer-motion'

type Props = {
  title?: string
  subtitle?: string
  progressCurrent?: number
  progressTotal?: number
}

/** Playful gold-bar cartoon walking while background generation runs. */
export function SocialGenerateCartoonLoader({
  title = 'Sedang jana content…',
  subtitle = 'Boleh tutup modal — background service terus jalan.',
  progressCurrent = 0,
  progressTotal = 7,
}: Props) {
  const pct =
    progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
      <div className="relative h-36 w-full max-w-sm overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a2140] to-[#141416] ring-1 ring-white/10">
        {/* soft sparkles */}
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full bg-amber-300/80"
            style={{ left: `${12 + i * 18}%`, top: `${18 + (i % 3) * 16}%` }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.3, 0.8] }}
            transition={{ duration: 1.6 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        {/* walking path */}
        <div className="absolute inset-x-6 bottom-8 h-px bg-white/10" />

        <motion.div
          className="absolute bottom-6"
          animate={{ x: ['8%', '72%', '8%'] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* gold bar character */}
          <motion.div
            className="relative"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative h-14 w-20 rounded-xl bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-[0_8px_20px_rgba(245,158,11,0.35)] ring-1 ring-amber-200/40">
              {/* face */}
              <div className="absolute left-3 top-4 flex gap-2">
                <motion.span
                  className="size-2 rounded-full bg-[#3b2a14]"
                  animate={{ scaleY: [1, 0.2, 1] }}
                  transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.05, 0.1] }}
                />
                <motion.span
                  className="size-2 rounded-full bg-[#3b2a14]"
                  animate={{ scaleY: [1, 0.2, 1] }}
                  transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.05, 0.1], delay: 0.05 }}
                />
              </div>
              <div className="absolute bottom-3 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full bg-[#3b2a14]/70" />
              <div className="absolute -right-1 top-2 rounded bg-[#7c5cff] px-1 py-[1px] text-[8px] font-bold text-white">
                999
              </div>
            </div>
            {/* legs */}
            <div className="mt-0.5 flex justify-center gap-3">
              <motion.span
                className="h-3 w-1.5 rounded-full bg-amber-600"
                animate={{ rotate: [-18, 18, -18] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.span
                className="h-3 w-1.5 rounded-full bg-amber-600"
                animate={{ rotate: [18, -18, 18] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        </motion.div>

        {/* floating hashtag bubble */}
        <motion.div
          className="absolute right-4 top-4 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-amber-200"
          animate={{ y: [0, -4, 0], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          #goldbar
        </motion.div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-white/45">{subtitle}</p>
      </div>

      <div className="w-full max-w-xs space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-amber-400"
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          />
        </div>
        <p className="text-[11px] text-white/40">
          {progressCurrent}/{progressTotal} · {pct}%
        </p>
      </div>
    </div>
  )
}
