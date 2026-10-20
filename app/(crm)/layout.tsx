import type { ReactNode } from 'react'
import { AuthProvider } from '@/app/contexts/auth-context'
import { CustomerEditModalProvider } from '@/app/contexts/customer-edit-modal-context'
import { ClientOnly } from '@/app/components/ClientOnly'
import ServiceWorkerRegistration from '@/app/components/ServiceWorkerRegistration'
import { MotionProvider } from '@/app/components/motion-provider'
import { PWAInstallPromptBootstrap } from '@/app/components/pwa/PWAInstallPromptBootstrap'
import { QueryProvider } from '@/app/components/providers/query-provider'
import { AppRouteShell } from '@/app/components/AppRouteShell'

export default function CrmAppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>
        <CustomerEditModalProvider>
          <MotionProvider>
            <PWAInstallPromptBootstrap />
            <ClientOnly>
              <ServiceWorkerRegistration />
            </ClientOnly>
            <AppRouteShell>{children}</AppRouteShell>
          </MotionProvider>
        </CustomerEditModalProvider>
      </QueryProvider>
    </AuthProvider>
  )
}
