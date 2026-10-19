'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/app/lib/supabase/client'
import { clearAllClientStorage } from '@/app/lib/auth/clear-client-storage'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      // Keep a stable user reference when id is unchanged so tab-focus
      // session recovery (SIGNED_IN / TOKEN_REFRESHED) does not re-run
      // every useEffect that depends on [user].
      setUser((prev) => {
        const next = session?.user ?? null
        if (prev?.id && next?.id && prev.id === next.id) return prev
        return next
      })
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' })
    } catch {
      // ignore
    }
    await clearAllClientStorage({ preserveSavedAccounts: true })
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' })
    } catch {
      // ignore
    }
    setUser(null)
    setSession(null)
  }

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.refreshSession()
    setSession(session)
    // Always take the new user here — callers (profile/password updates)
    // need fresh user_metadata even when id is unchanged.
    setUser(session?.user ?? null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

