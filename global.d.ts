export {}

declare global {
  interface Window {
    googleContactsIntegration?: {
      signIn: () => void
      signOut: () => void
      importContacts: (data: Record<string, unknown>[]) => Promise<void>
      isSignedIn: () => boolean
      isLoading?: () => boolean
      isInitialized: () => boolean
    }
  }
}
