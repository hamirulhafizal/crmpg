'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type AppShellChromeContextValue = {
  titleOverride: string | null
  headerExtra: ReactNode
  deferWhatsAppPrompt: boolean
  setTitleOverride: (title: string | null) => void
  setHeaderExtra: (node: ReactNode) => void
  setDeferWhatsAppPrompt: (defer: boolean) => void
}

const AppShellChromeContext = createContext<AppShellChromeContextValue | null>(null)

export function AppShellChromeProvider({ children }: { children: ReactNode }) {
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [headerExtra, setHeaderExtraState] = useState<ReactNode>(null)
  const [deferWhatsAppPrompt, setDeferWhatsAppPrompt] = useState(false)

  const setHeaderExtra = useCallback((node: ReactNode) => {
    setHeaderExtraState(node)
  }, [])

  const value = useMemo(
    () => ({
      titleOverride,
      headerExtra,
      deferWhatsAppPrompt,
      setTitleOverride,
      setHeaderExtra,
      setDeferWhatsAppPrompt,
    }),
    [titleOverride, headerExtra, deferWhatsAppPrompt, setHeaderExtra]
  )

  return <AppShellChromeContext.Provider value={value}>{children}</AppShellChromeContext.Provider>
}

export function useAppShellChrome() {
  const ctx = useContext(AppShellChromeContext)
  if (!ctx) {
    throw new Error('useAppShellChrome must be used within AppShellChromeProvider')
  }
  return ctx
}

/** Safe for pages that may render outside the app shell (no-op). */
export function useOptionalAppShellChrome() {
  return useContext(AppShellChromeContext)
}
