'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

const NARROW_MEDIA = '(max-width: 639px)'

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW_MEDIA)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getNarrowSnapshot() {
  return window.matchMedia(NARROW_MEDIA).matches
}

function getNarrowServerSnapshot() {
  return false
}

function useIsNarrow() {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, getNarrowServerSnapshot)
}

const mobilePanelVariants = {
  hidden: { y: '100%', opacity: 1 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, damping: 32, stiffness: 360 },
  },
  exit: {
    y: '100%',
    opacity: 1,
    transition: { type: 'tween' as const, duration: 0.28, ease: [0.32, 0.72, 0, 1] as const },
  },
}

const desktopPanelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 28, stiffness: 380 },
  },
  exit: {
    opacity: 0,
    scale: 1,
    y: 0,
    transition: { type: 'tween' as const, duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  },
}

type AnimatedSheetDialogProps = {
  open: boolean
  onClose: () => void
  onExitComplete?: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidthClassName?: string
}

export function AnimatedSheetDialog({
  open,
  onClose,
  onExitComplete,
  title,
  children,
  footer,
  maxWidthClassName = 'max-w-2xl',
}: AnimatedSheetDialogProps) {
  const isNarrow = useIsNarrow()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <motion.div
          key="animated-sheet-dialog-root"
          className="fixed inset-0 z-50 isolate"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          <motion.div
            role="presentation"
            aria-hidden
            className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 1, 1] }}
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="animated-sheet-dialog-title"
              className={`pointer-events-auto flex max-h-[94vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-t-2xl bg-white opacity-100 shadow-2xl sm:max-h-[90vh] sm:rounded-2xl`}
              variants={isNarrow ? mobilePanelVariants : desktopPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />

              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <h2 id="animated-sheet-dialog-title" className="text-lg font-semibold text-slate-900">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-white">{children}</div>

              {footer ? (
                <div className="shrink-0 border-t border-slate-200 bg-white">{footer}</div>
              ) : null}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
