'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring' as const, damping: 32, stiffness: 360 },
  },
  exit: {
    y: '100%',
    transition: { type: 'tween' as const, duration: 0.28, ease: [0.32, 0.72, 0, 1] as const },
  },
}

/** Opacity/scale only — no translateY, so flexbox centering stays correct. */
const desktopPanelVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, damping: 28, stiffness: 380 },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { type: 'tween' as const, duration: 0.2, ease: [0.4, 0, 1, 1] as const },
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
  /** Extra classes on the dialog panel (e.g. fixed mobile height). */
  panelClassName?: string
  /** Extra classes on the scrollable/body region wrapping children. */
  bodyClassName?: string
}

export function AnimatedSheetDialog({
  open,
  onClose,
  onExitComplete,
  title,
  children,
  footer,
  maxWidthClassName = 'max-w-2xl',
  panelClassName = '',
  bodyClassName = 'overflow-y-auto',
}: AnimatedSheetDialogProps) {
  const isNarrow = useIsNarrow()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!mounted) return null

  const header = (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
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
  )

  const body = (
    <div className={`min-h-0 flex-1 overscroll-contain bg-white ${bodyClassName}`.trim()}>{children}</div>
  )

  const footerNode = footer ? (
    <div className="shrink-0 border-t border-slate-200 bg-white">{footer}</div>
  ) : null

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <motion.div
          key="animated-sheet-dialog-root"
          className="fixed inset-0 z-[100] isolate overscroll-none"
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

          {isNarrow ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center overflow-hidden"
              style={{
                paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="animated-sheet-dialog-title"
                className={`pointer-events-auto flex w-full ${maxWidthClassName} max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ${panelClassName}`.trim()}
                variants={mobilePanelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-200" />
                {header}
                {body}
                {footerNode}
              </motion.div>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-y-auto overscroll-contain p-4">
              <div className="flex min-h-full items-center justify-center py-4">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="animated-sheet-dialog-title"
                  className={`pointer-events-auto flex w-full ${maxWidthClassName} max-h-[min(90dvh,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${panelClassName}`.trim()}
                  variants={desktopPanelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {header}
                  {body}
                  {footerNode}
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
