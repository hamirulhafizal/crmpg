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
  savename?: string
  SaveName?: string
  SAVENAME?: string
  'D.O.B'?: string
  'D.O.B.'?: string
  DOB?: string
  Birthday?: string
  Email?: string
  Phone?: string
  Telephone?: string
}

interface GoogleContactsIntegrationProps {
  onConnectionChange?: (connected: boolean) => void
  onImportResult?: (result: { success: boolean; message: string }) => void
  onImportProgress?: (current: number, total: number) => void
}

export default function GoogleContactsIntegration({
  onConnectionChange,
  onImportResult,
  onImportProgress,
}: GoogleContactsIntegrationProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [tokenClient, setTokenClient] = useState<any>(null)

  const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID || ''
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''
  const SCOPES = 'https://www.googleapis.com/auth/contacts'
  // Official discovery doc URL from Google's quickstart guide
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/people/v1/rest'

  // Initialize Google APIs - following official quickstart pattern
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isInitialized) return

    let gapiInited = false
    let gisInited = false

    // Callback after api.js is loaded (from quickstart guide)
    const gapiLoaded = () => {
      if (window.gapi && window.gapi.load) {
        window.gapi.load('client', initializeGapiClient)
      }
    }

    // Callback after the API client is loaded (from quickstart guide)
    const initializeGapiClient = async () => {
      try {
        if (!CLIENT_ID) {
          console.warn('Google Contacts Client ID not configured')
          setIsInitialized(true)
          return
        }

        await window.gapi.client.init({
          apiKey: API_KEY || undefined,
          discoveryDocs: [DISCOVERY_DOC],
        })

        gapiInited = true
        maybeEnableButtons()
      } catch (error: any) {
        console.error('Failed to initialize gapi client:', error)
        setIsInitialized(true) // Mark as initialized even on error
      }
    }

    // Callback after Google Identity Services are loaded (from quickstart guide)
    const gisLoaded = () => {
      if (window.google?.accounts?.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (tokenResponse: any) => {
            if (tokenResponse.access_token) {
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
        gisInited = true
        maybeEnableButtons()
      }
    }

    // Enable buttons after all libraries are loaded (from quickstart guide)
    const maybeEnableButtons = () => {
      if (gapiInited && gisInited) {
        // Check if user is already signed in
        const token = window.gapi?.client?.getToken()
        if (token && token.access_token) {
          setIsSignedIn(true)
          onConnectionChange?.(true)
        }
        setIsInitialized(true)
      }
    }

    // Load scripts following quickstart pattern
    const loadScripts = () => {
      // Load Google API Client Library
      const gapiScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]')
      if (!gapiScript) {
        const script1 = document.createElement('script')
        script1.src = 'https://apis.google.com/js/api.js'
        script1.async = true
        script1.defer = true
        script1.onload = gapiLoaded
        script1.onerror = () => {
          console.error('Failed to load Google API script')
          setIsInitialized(true)
        }
        document.head.appendChild(script1)
      } else {
        // Script already exists, wait for it to load
        if (window.gapi && window.gapi.load) {
          gapiLoaded()
        } else {
          const checkInterval = setInterval(() => {
            if (window.gapi && window.gapi.load) {
              clearInterval(checkInterval)
              gapiLoaded()
            }
          }, 100)
          setTimeout(() => {
            clearInterval(checkInterval)
            if (!window.gapi) {
              console.error('GAPI not available after script load')
              setIsInitialized(true)
            }
          }, 5000)
        }
      }

      // Load Google Identity Services
      const gisScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
      if (!gisScript) {
        const script2 = document.createElement('script')
        script2.src = 'https://accounts.google.com/gsi/client'
        script2.async = true
        script2.defer = true
        script2.onload = gisLoaded
        script2.onerror = () => {
          console.error('Failed to load Google Identity Services script')
          setIsInitialized(true)
        }
        document.head.appendChild(script2)
      } else {
        // Script already exists
        if (window.google?.accounts?.oauth2) {
          gisLoaded()
        } else {
          const checkInterval = setInterval(() => {
            if (window.google?.accounts?.oauth2) {
              clearInterval(checkInterval)
              gisLoaded()
            }
          }, 100)
          setTimeout(() => {
            clearInterval(checkInterval)
            if (!window.google) {
              console.error('Google Identity Services not available after script load')
              setIsInitialized(true)
            }
          }, 5000)
        }
      }
    }

    loadScripts()
  }, [CLIENT_ID, API_KEY, SCOPES, DISCOVERY_DOC, isInitialized, onConnectionChange, onImportResult])

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
      return
    }

    try {
      // Following quickstart pattern
      if (window.gapi.client.getToken() === null) {
        // Prompt for consent
        tokenClient.requestAccessToken({ prompt: 'consent' })
      } else {
        // Skip consent for existing session
        tokenClient.requestAccessToken({ prompt: '' })
      }
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

  const parseBirthday = useCallback((dateStr: string): { year?: number; month: number; day: number } | null => {
    if (!dateStr || typeof dateStr !== 'string') return null
    
    const trimmed = dateStr.trim()
    if (!trimmed) return null

    // Try different date formats
    // Format: YYYY-MM-DD
    let match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[3], 10),
      }
    }

    // Format: DD/MM/YYYY or MM/DD/YYYY
    match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (match) {
      const part1 = parseInt(match[1], 10)
      const part2 = parseInt(match[2], 10)
      const year = parseInt(match[3], 10)
      
      // Try to determine if it's DD/MM or MM/DD (assume DD/MM if day > 12)
      if (part1 > 12) {
        return { year, month: part2, day: part1 }
      } else if (part2 > 12) {
        return { year, month: part1, day: part2 }
      } else {
        // Ambiguous, default to DD/MM
        return { year, month: part2, day: part1 }
      }
    }

    // Format: DD-MM-YYYY
    match = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (match) {
      return {
        year: parseInt(match[3], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[1], 10),
      }
    }

    return null
  }, [])

  const mapToGoogleContact = useCallback((row: ProcessedRow): any => {
    const contact: any = {
      names: [],
      emailAddresses: [],
      phoneNumbers: [],
      birthdays: [],
    }

    // Map names - Priority: savename > SenderName > FirstName
    const saveName = row.savename || row['savename'] || row.SaveName || row['SaveName'] || row.SAVENAME || row['SAVENAME'] || ''
    const senderName = row.SenderName || row['SenderName'] || ''
    const firstName = row.FirstName || row['FirstName'] || row['First Name'] || ''
    const fullName = row.Name || row['Name'] || ''

    // Use savename as First Name (givenName), fallback to SenderName or FirstName
    const givenName = saveName || senderName || firstName || ''

    // Extract last name from full name if available
    let familyName = ''
    if (fullName && !saveName && !senderName) {
      const nameParts = fullName.split(' ')
      if (nameParts.length > 1) {
        familyName = nameParts.slice(1).join(' ')
      }
    }

    if (givenName || fullName) {
      contact.names.push({
        displayName: fullName || saveName || senderName || firstName || '',
        givenName: givenName, // savename is used as First Name
        familyName: familyName,
      })
    }

    // Map birthday - Priority: D.O.B > DOB > Birthday
    const dob = row['D.O.B'] || row['D.O.B.'] || row.DOB || row['DOB'] || row.Birthday || row['Birthday'] || row.birthday || ''
    if (dob) {
      const birthdayDate = parseBirthday(dob)
      if (birthdayDate) {
        contact.birthdays.push({
          date: birthdayDate,
        })
      }
    }

    // Map email
    const email = row.Email || row.email || row['E-mail'] || row['E-Mail'] || row['E-mail 1 - Value'] || ''
    if (email) {
      contact.emailAddresses.push({
        value: email,
        type: 'work',
      })
    }

    // Map phone
    const phone = row.Phone || row.Telephone || row['Phone Number'] || row.phone || row['Phone 1 - Value'] || ''
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
  }, [parseBirthday])

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
        // Verify gapi client is initialized
        if (!window.gapi?.client) {
          throw new Error('Google API client not initialized. Please refresh the page and try again.')
        }

        // Verify token is set
        const token = window.gapi?.client?.getToken()
        if (!token || !token.access_token) {
          throw new Error('No access token available. Please reconnect your Google account using the "Connect Google Contacts" button.')
        }

        // Verify People API is loaded (from quickstart pattern)
        if (!window.gapi.client.people) {
          throw new Error('Google People API not initialized. Please refresh the page and try again.')
        }

        const results = {
          total: processedData.length,
          created: 0,
          failed: 0,
          errors: [] as string[],
        }

        // Import contacts one by one using People API (from quickstart pattern)
        for (let i = 0; i < processedData.length; i++) {
          const row = processedData[i]
          try {

            console.log('row--->', row)

            const contact = mapToGoogleContact(row)

            // Verify we have required fields
            if (!contact.names || contact.names.length === 0) {
              results.failed++
              results.errors.push(`Row ${i + 1}: Missing name field (SenderName or Name required)`)
              // Report progress even for skipped rows
              onImportProgress?.(i + 1, processedData.length)
              continue
            }

            // Use createContact API (from quickstart pattern)
            const response = await window.gapi.client.people.people.createContact({
              resource: contact,
            })

            if (response.result) {
              results.created++
            } else {
              results.failed++
              results.errors.push(`Row ${i + 1}: Failed to create contact`)
            }

            // Report progress after each contact
            onImportProgress?.(i + 1, processedData.length)

            // Add small delay to avoid rate limiting
            if (i < processedData.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
          } catch (error: any) {
            results.failed++
            const errorMessage = error.message || error.error?.message || 'Unknown error'
            results.errors.push(`Row ${i + 1}: ${errorMessage}`)
            console.error(`Failed to create contact for row ${i + 1}:`, error)
            // Report progress even on error
            onImportProgress?.(i + 1, processedData.length)
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
    [isInitialized, isSignedIn, mapToGoogleContact, onImportResult, onImportProgress]
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
          hasPeopleAPI: !!window.gapi?.client?.people,
        }),
      }

      ;(window as any).googleContactsIntegration = integration

      // console.log('GoogleContactsIntegration exposed to window:', {
      //   isInitialized,
      //   isSignedIn,
      //   hasClientId: !!CLIENT_ID,
      //   hasApiKey: !!API_KEY,
      //   hasGoogle: !!window.google,
      //   hasGapi: !!window.gapi,
      //   hasPeopleAPI: !!window.gapi?.client?.people,
      // })
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).googleContactsIntegration
      }
    }
  }, [signIn, signOut, importContacts, isSignedIn, isLoading, isInitialized, CLIENT_ID, API_KEY])

  return null // This component doesn't render anything
}
