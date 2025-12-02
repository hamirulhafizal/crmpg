'use client'

import { useEffect, useState, useCallback } from 'react'

declare global {
  interface Window {
    gapi: any
    google: any
  }
}

interface ProcessedRow {
  [key: string]: any
  Name?: string
  SenderName?: string
  FirstName?: string
  Email?: string
  Phone?: string
  Telephone?: string
}

interface GoogleContactsIntegrationProps {
  onConnectionChange?: (connected: boolean) => void
  onImportResult?: (result: { success: boolean; message: string }) => void
}

export default function GoogleContactsIntegration({
  onConnectionChange,
  onImportResult,
}: GoogleContactsIntegrationProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [tokenClient, setTokenClient] = useState<any>(null)

  const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID || ''
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''
  const SCOPES = 'https://www.googleapis.com/auth/contacts'

  // Load Google API scripts
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Load Google Identity Services
    const loadGIS = () => {
      if (window.google?.accounts) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = () => resolve(undefined)
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
        document.head.appendChild(script)
      })
    }

    // Load Google API Client
    const loadGapi = () => {
      if (window.gapi?.client) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://apis.google.com/js/api.js'
        script.async = true
        script.defer = true
        script.onload = () => {
          window.gapi.load('client', resolve)
        }
        script.onerror = () => reject(new Error('Failed to load Google API'))
        document.head.appendChild(script)
      })
    }

    const initialize = async () => {
      try {
        if (!CLIENT_ID) {
          console.warn('Google Contacts Client ID not configured. Set NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID in environment variables.')
          setIsInitialized(true) // Mark as initialized even without credentials so UI can show error
          return
        }

        await Promise.all([loadGIS(), loadGapi()])

        // Initialize gapi client
        await window.gapi.client.init({
          apiKey: API_KEY || undefined, // API key is optional for OAuth flow
          discoveryDocs: ['https://people.googleapis.com/$discovery/rest?version=v1'],
        })

        // Initialize token client
        if (window.google?.accounts?.oauth2) {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse: any) => {
              if (tokenResponse.access_token) {
                // Set the token in gapi client
                window.gapi.client.setToken({
                  access_token: tokenResponse.access_token,
                })
                setIsSignedIn(true)
                onConnectionChange?.(true)
              } else if (tokenResponse.error) {
                console.error('Google OAuth error:', tokenResponse.error)
                onImportResult?.({
                  success: false,
                  message: `Google OAuth error: ${tokenResponse.error}`,
                })
              }
            },
          })
          setTokenClient(client)
        } else {
          console.error('Google Identity Services not loaded')
        }

        // Check if user is already signed in
        const token = window.gapi.client.getToken()
        if (token && token.access_token) {
          setIsSignedIn(true)
          onConnectionChange?.(true)
        }

        setIsInitialized(true)
      } catch (error: any) {
        console.error('Failed to initialize Google API:', error)
        setIsInitialized(true) // Mark as initialized so UI can show error
        onImportResult?.({
          success: false,
          message: `Failed to initialize Google API: ${error.message || 'Unknown error'}`,
        })
      }
    }

    initialize()
  }, [CLIENT_ID, API_KEY, SCOPES, onConnectionChange])

  const signIn = useCallback(() => {
    if (!CLIENT_ID) {
      onImportResult?.({
        success: false,
        message: 'Google Contacts Client ID not configured. Please set NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID in environment variables.',
      })
      return
    }

    if (!tokenClient) {
      onImportResult?.({
        success: false,
        message: 'Google API not initialized. Please wait a moment and try again, or refresh the page.',
      })
      console.error('Token client not available. Is Google API loaded?')
      return
    }

    try {
      // Request access token with consent prompt
      tokenClient.requestAccessToken({ prompt: 'consent' })
    } catch (error: any) {
      console.error('Error requesting access token:', error)
      onImportResult?.({
        success: false,
        message: `Failed to connect: ${error.message || 'Unknown error'}`,
      })
    }
  }, [tokenClient, CLIENT_ID, onImportResult])

  const signOut = useCallback(() => {
    const token = window.gapi?.client?.getToken()
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken('')
        setIsSignedIn(false)
        onConnectionChange?.(false)
      })
    }
  }, [onConnectionChange])

  const mapToGoogleContact = useCallback((row: ProcessedRow): any => {
    const contact: any = {
      names: [],
      emailAddresses: [],
      phoneNumbers: [],
    }

    // Map names - Use SenderName as First Name (givenName)
    const senderName = row.SenderName || row['SenderName'] || ''
    const firstName = row.FirstName || row['FirstName'] || ''
    const fullName = row.Name || row['Name'] || ''

    // Use SenderName as First Name (givenName)
    const givenName = senderName || firstName || ''

    // Extract last name from full name if available
    let familyName = ''
    if (fullName && !senderName) {
      const nameParts = fullName.split(' ')
      if (nameParts.length > 1) {
        familyName = nameParts.slice(1).join(' ')
      }
    }

    if (givenName || fullName) {
      contact.names.push({
        displayName: fullName || senderName || firstName || '',
        givenName: givenName,
        familyName: familyName,
      })
    }

    // Map email
    const email = row.Email || row.email || row['E-mail'] || row['E-Mail'] || ''
    if (email) {
      contact.emailAddresses.push({
        value: email,
        type: 'work',
      })
    }

    // Map phone
    const phone = row.Phone || row.Telephone || row['Phone Number'] || row.phone || ''
    if (phone) {
      // Clean phone number format
      let cleanPhone = String(phone).replace(/\D/g, '') // Remove non-digits
      if (cleanPhone && !cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone
      }
      if (cleanPhone) {
        contact.phoneNumbers.push({
          value: cleanPhone,
          type: 'mobile',
        })
      }
    }

    return contact
  }, [])

  const importContacts = useCallback(
    async (processedData: ProcessedRow[]) => {
      if (!isInitialized || !isSignedIn) {
        onImportResult?.({
          success: false,
          message: 'Please sign in to Google Contacts first.',
        })
        return
      }

      if (!processedData || processedData.length === 0) {
        onImportResult?.({
          success: false,
          message: 'No data to import.',
        })
        return
      }

      setIsLoading(true)

      try {
        const results = {
          total: processedData.length,
          created: 0,
          failed: 0,
          errors: [] as string[],
        }

        // Import contacts one by one (Google doesn't allow bulk createContact)
        for (let i = 0; i < processedData.length; i++) {
          const row = processedData[i]
          try {
            const contact = mapToGoogleContact(row)

            // Use createContact API
            const response = await window.gapi.client.people.people.createContact({
              resource: contact,
            })

            if (response.result) {
              results.created++
            } else {
              results.failed++
              results.errors.push(`Row ${i + 1}: Failed to create contact`)
            }

            // Add small delay to avoid rate limiting
            if (i < processedData.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
          } catch (error: any) {
            results.failed++
            results.errors.push(
              `Row ${i + 1}: ${error.message || error.error?.message || 'Unknown error'}`
            )
          }
        }

        const message =
          results.created > 0
            ? `Successfully imported ${results.created} contacts. ${results.failed} failed.`
            : `Failed to import contacts. ${results.failed} errors.`

        onImportResult?.({
          success: results.created > 0,
          message,
        })
      } catch (error: any) {
        console.error('Import error:', error)
        onImportResult?.({
          success: false,
          message: error.message || 'Failed to import contacts to Google',
        })
      } finally {
        setIsLoading(false)
      }
    },
    [isInitialized, isSignedIn, mapToGoogleContact, onImportResult]
  )

  // Expose methods via window object for use in parent component
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const integration = {
        signIn,
        signOut,
        importContacts,
        isSignedIn: () => isSignedIn,
        isLoading: () => isLoading,
        isInitialized: () => isInitialized,
        getStatus: () => ({
          isInitialized,
          isSignedIn,
          isLoading,
          hasClientId: !!CLIENT_ID,
          hasApiKey: !!API_KEY,
          hasGoogle: !!window.google,
          hasGapi: !!window.gapi,
        }),
      }
      
      ;(window as any).googleContactsIntegration = integration
      
      // Log status for debugging
      console.log('GoogleContactsIntegration exposed to window:', {
        isInitialized,
        hasClientId: !!CLIENT_ID,
        hasGoogle: !!window.google,
        hasGapi: !!window.gapi,
      })
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).googleContactsIntegration
      }
    }
  }, [signIn, signOut, importContacts, isSignedIn, isLoading, isInitialized, CLIENT_ID, API_KEY])

  return null // This component doesn't render anything
}

