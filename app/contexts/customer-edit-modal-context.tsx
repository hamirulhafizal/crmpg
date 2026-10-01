'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/contexts/auth-context'
import {
  CustomerEditModalShell,
  type CustomerEditModalTab,
} from '@/app/components/customer-edit-modal/CustomerEditModalShell'
import { invalidateCachedWhatsAppAvatarUrl } from '@/app/lib/customers/avatar-url-cache'
import { customerKeys } from '@/app/lib/customers/query-keys'
import type { StoredFollowUpResume } from '@/app/lib/follow-up-resume'

export type { CustomerEditModalTab }

export type FollowUpResumeContext = {
  accountStatusFilter: string
  page: number
  viewMode: 'paginated' | 'all'
}

export type OpenCustomerOptions = {
  tab?: CustomerEditModalTab
  /** Optional snapshot so the modal can paint before the API fetch completes. */
  initialCustomer?: Record<string, unknown> | null
  followUpResumeContext?: FollowUpResumeContext | null
  overlayZIndexClassName?: string
}

type CustomerEditModalContextValue = {
  openCustomerById: (customerId: string, opts?: OpenCustomerOptions) => void
  openCreateCustomer: (opts?: Omit<OpenCustomerOptions, 'initialCustomer'>) => void
  closeCustomerModal: () => void
  /** Subscribe to save events (e.g. refresh lists). Returns unsubscribe. */
  subscribeOnSaved: (listener: (customerId: string | null) => void) => () => void
  /** Subscribe to follow-up resume checkpoint sync. Returns unsubscribe. */
  subscribeOnResumeSynced: (listener: (stored: StoredFollowUpResume) => void) => () => void
}

const CustomerEditModalContext = createContext<CustomerEditModalContextValue | null>(null)

export function useCustomerEditModal(): CustomerEditModalContextValue {
  const ctx = useContext(CustomerEditModalContext)
  if (!ctx) {
    throw new Error('useCustomerEditModal must be used within CustomerEditModalProvider')
  }
  return ctx
}

type ModalState = {
  open: boolean
  isCreating: boolean
  customerId: string | null
  initialCustomer: Record<string, unknown> | null
  initialTab: CustomerEditModalTab
  followUpResumeContext: FollowUpResumeContext | null
  overlayZIndexClassName?: string
}

const CLOSED: ModalState = {
  open: false,
  isCreating: false,
  customerId: null,
  initialCustomer: null,
  initialTab: 'details',
  followUpResumeContext: null,
  overlayZIndexClassName: undefined,
}

export function CustomerEditModalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState<ModalState>(CLOSED)

  const savedListenersRef = useRef(new Set<(customerId: string | null) => void>())
  const resumeListenersRef = useRef(new Set<(stored: StoredFollowUpResume) => void>())

  const openCustomerById = useCallback((id: string, opts?: OpenCustomerOptions) => {
    const trimmed = id?.trim()
    if (!trimmed) return
    setState({
      open: true,
      isCreating: false,
      customerId: trimmed,
      initialCustomer: (opts?.initialCustomer as Record<string, unknown> | null | undefined) ?? null,
      initialTab: opts?.tab ?? 'details',
      followUpResumeContext: opts?.followUpResumeContext ?? null,
      overlayZIndexClassName: opts?.overlayZIndexClassName,
    })
  }, [])

  const openCreateCustomer = useCallback((opts?: Omit<OpenCustomerOptions, 'initialCustomer'>) => {
    setState({
      open: true,
      isCreating: true,
      customerId: null,
      initialCustomer: {},
      initialTab: opts?.tab ?? 'details',
      followUpResumeContext: null,
      overlayZIndexClassName: opts?.overlayZIndexClassName,
    })
  }, [])

  const closeCustomerModal = useCallback(() => {
    setState(CLOSED)
  }, [])

  const subscribeOnSaved = useCallback((listener: (customerId: string | null) => void) => {
    savedListenersRef.current.add(listener)
    return () => {
      savedListenersRef.current.delete(listener)
    }
  }, [])

  const subscribeOnResumeSynced = useCallback((listener: (stored: StoredFollowUpResume) => void) => {
    resumeListenersRef.current.add(listener)
    return () => {
      resumeListenersRef.current.delete(listener)
    }
  }, [])

  const handleSaved = useCallback(() => {
    const id = state.customerId
    if (user?.id) {
      void queryClient.invalidateQueries({ queryKey: customerKeys.lists(user.id) })
      void queryClient.invalidateQueries({ queryKey: customerKeys.stats(user.id) })
      void queryClient.invalidateQueries({ queryKey: customerKeys.salesJourney(user.id) })
      void queryClient.invalidateQueries({ queryKey: customerKeys.team(user.id) })
      if (id) {
        invalidateCachedWhatsAppAvatarUrl(user.id, id)
        void queryClient.invalidateQueries({ queryKey: customerKeys.avatar(user.id, id) })
        void queryClient.invalidateQueries({ queryKey: customerKeys.detail(user.id, id) })
      }
    }
    savedListenersRef.current.forEach((fn) => {
      try {
        fn(id)
      } catch {
        /* ignore listener errors */
      }
    })
  }, [queryClient, state.customerId, user?.id])

  const handleResumeSynced = useCallback((stored: StoredFollowUpResume) => {
    resumeListenersRef.current.forEach((fn) => {
      try {
        fn(stored)
      } catch {
        /* ignore listener errors */
      }
    })
  }, [])

  const value = useMemo(
    () => ({
      openCustomerById,
      openCreateCustomer,
      closeCustomerModal,
      subscribeOnSaved,
      subscribeOnResumeSynced,
    }),
    [
      openCustomerById,
      openCreateCustomer,
      closeCustomerModal,
      subscribeOnSaved,
      subscribeOnResumeSynced,
    ]
  )

  return (
    <CustomerEditModalContext.Provider value={value}>
      {children}
      <CustomerEditModalShell
        open={state.open}
        isCreating={state.isCreating}
        customerId={state.customerId}
        initialCustomer={state.initialCustomer as Parameters<typeof CustomerEditModalShell>[0]['initialCustomer']}
        initialTab={state.initialTab}
        overlayZIndexClassName={state.overlayZIndexClassName}
        followUpResumeContext={state.followUpResumeContext}
        onResumeSynced={handleResumeSynced}
        onClose={closeCustomerModal}
        onSaved={handleSaved}
      />
    </CustomerEditModalContext.Provider>
  )
}
