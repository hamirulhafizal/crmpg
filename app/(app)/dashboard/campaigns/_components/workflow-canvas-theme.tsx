'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type WorkflowCanvasTheme = 'light' | 'dark'

const STORAGE_KEY = 'campaign-workflow-canvas-theme'

type WorkflowCanvasThemeContextValue = {
  theme: WorkflowCanvasTheme
  isDark: boolean
  toggleTheme: () => void
  setTheme: (theme: WorkflowCanvasTheme) => void
}

const WorkflowCanvasThemeContext = createContext<WorkflowCanvasThemeContextValue | null>(null)

function readStoredTheme(): WorkflowCanvasTheme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

export function WorkflowCanvasThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<WorkflowCanvasTheme>('light')

  useEffect(() => {
    setThemeState(readStoredTheme())
  }, [])

  const setTheme = useCallback((next: WorkflowCanvasTheme) => {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme]
  )

  return <WorkflowCanvasThemeContext.Provider value={value}>{children}</WorkflowCanvasThemeContext.Provider>
}

export function useWorkflowCanvasTheme(): WorkflowCanvasThemeContextValue {
  const ctx = useContext(WorkflowCanvasThemeContext)
  if (!ctx) {
    throw new Error('useWorkflowCanvasTheme must be used within WorkflowCanvasThemeProvider')
  }
  return ctx
}

export function workflowCanvasShellProps(theme: WorkflowCanvasTheme) {
  return {
    'data-workflow-theme': theme,
    className: theme === 'dark' ? 'campaign-workflow-shell--dark' : undefined,
  } as const
}
