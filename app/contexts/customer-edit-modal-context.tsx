'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CustomerEditModalShell,
  type CustomerEditModalTab,
} from '@/app/components/customer-edit-modal/CustomerEditModalShell'

export type { CustomerEditModalTab }

export type OpenCustomerOptions = {
  tab?: CustomerEditModalTab
}

type CustomerEditModalContextValue = {
  openCustomerById: (customerId: string, opts?: OpenCustomerOptions) => void
  closeCustomerModal: () => void
}

const CustomerEditModalContext = createContext<CustomerEditModalContextValue | null>(null)

export function useCustomerEditModal(): CustomerEditModalContextValue {
  const ctx = useContext(CustomerEditModalContext)
  if (!ctx) {
    throw new Error('useCustomerEditModal must be used within CustomerEditModalProvider')
  }
  return ctx
}

export function CustomerEditModalProvider({ children }: { children: ReactNode }) {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [initialTab, setInitialTab] = useState<CustomerEditModalTab>('details')

  const openCustomerById = useCallback((id: string, opts?: OpenCustomerOptions) => {
    setInitialTab(opts?.tab ?? 'details')
    setCustomerId(id)
  }, [])

  const closeCustomerModal = useCallback(() => {
    setCustomerId(null)
    setInitialTab('details')
  }, [])

  const value = useMemo(
    () => ({
      openCustomerById,
      closeCustomerModal,
    }),
    [openCustomerById, closeCustomerModal],
  )

  return (
    <CustomerEditModalContext.Provider value={value}>
      {children}
      <CustomerEditModalShell
        open={Boolean(customerId)}
        isCreating={false}
        customerId={customerId}
        initialCustomer={null}
        initialTab={initialTab}
        followUpResumeContext={null}
        onResumeSynced={() => {}}
        onClose={closeCustomerModal}
        onSaved={() => {}}
      />
    </CustomerEditModalContext.Provider>
  )
}
