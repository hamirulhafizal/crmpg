'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  readGoogleContactNameFromRow,
  toGooglePeopleName,
} from '@/app/lib/customers/google-contact-name'

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

function isGoogleAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    status?: number
    result?: { error?: { code?: number; status?: string; message?: string } }
    body?: string
    message?: string
  }
  if (err.status === 401 || err.result?.error?.code === 401) return true
  const status = err.result?.error?.status || ''
  if (status === 'UNAUTHENTICATED') return true
  const message = `${err.result?.error?.message || ''} ${err.message || ''} ${err.body || ''}`
  return /invalid_token|invalid authentication credentials|unauthenticated/i.test(message)
}

function googleErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const err = error as {
    message?: string
    result?: { error?: { message?: string } }
    error?: { message?: string }
  }
  return err.result?.error?.message || err.error?.message || err.message || 'Unknown error'
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
  const tokenClientRef = useRef<any>(null)
  const tokenExpiresAtRef = useRef(0)
  const tokenWaitersRef = useRef<Array<(ok: boolean) => void>>([])
  const refreshLockRef = useRef<Promise<boolean> | null>(null)

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
            const waiters = tokenWaitersRef.current.splice(0)
            if (tokenResponse.access_token) {
              window.gapi.client.setToken({
                access_token: tokenResponse.access_token,
              })
              const expiresInSec = Number(tokenResponse.expires_in)
              tokenExpiresAtRef.current =
                Date.now() + (Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 3600) * 1000
              setIsSignedIn(true)
              onConnectionChange?.(true)
              waiters.forEach((resolve) => resolve(true))
            } else {
              if (tokenResponse.error && waiters.length === 0) {
                console.error('Google OAuth error:', tokenResponse.error)
                onImportResult?.({
                  success: false,
                  message: `Google OAuth error: ${tokenResponse.error}`,
                })
              }
              waiters.forEach((resolve) => resolve(false))
            }
          },
        })
        tokenClientRef.current = client
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
        tokenExpiresAtRef.current = 0
        setIsSignedIn(false)
        onConnectionChange?.(false)
      })
    }
  }, [onConnectionChange])

  const refreshAccessToken = useCallback((): Promise<boolean> => {
    if (refreshLockRef.current) return refreshLockRef.current
    const client = tokenClientRef.current
    if (!client) return Promise.resolve(false)

    const run = new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(ok)
      }
      const timer = window.setTimeout(() => finish(false), 30000)
      tokenWaitersRef.current.push(finish)
      try {
        // Drop the stale token so GIS cannot keep sending it.
        window.gapi?.client?.setToken('')
        client.requestAccessToken({ prompt: '' })
      } catch (error) {
        console.error('Failed to refresh Google access token:', error)
        tokenWaitersRef.current = tokenWaitersRef.current.filter((waiter) => waiter !== finish)
        finish(false)
      }
    })

    const wrapped = run.finally(() => {
      if (refreshLockRef.current === wrapped) refreshLockRef.current = null
    })
    refreshLockRef.current = wrapped
    return wrapped
  }, [])

  const prepareImport = useCallback(async (): Promise<boolean> => {
    return refreshAccessToken()
  }, [refreshAccessToken])

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

  const mapToGoogleContact = useCallback((row: ProcessedRow): Record<string, unknown> | null => {
    const contact: Record<string, unknown> = {}

    const contactName = readGoogleContactNameFromRow(row)
    if (contactName) {
      contact.names = [toGooglePeopleName(contactName)]
    } else {
      return null
    }

    const dob = row['D.O.B'] || row['D.O.B.'] || row.DOB || row['DOB'] || row.Birthday || row['Birthday'] || row.birthday || ''
    if (dob) {
      const birthdayDate = parseBirthday(dob)
      if (birthdayDate) {
        contact.birthdays = [{ date: birthdayDate }]
      }
    }

    const email = row.Email || row.email || row['E-mail'] || row['E-Mail'] || row['E-mail 1 - Value'] || ''
    if (email) {
      contact.emailAddresses = [{ value: email, type: 'work' }]
    }

    const phone = row.Phone || row.Telephone || row['Phone Number'] || row.phone || row['Phone 1 - Value'] || ''
    if (phone) {
      let cleanPhone = String(phone).replace(/\D/g, '')
      if (cleanPhone && !cleanPhone.startsWith('+')) {
        cleanPhone = '+' + cleanPhone
      }
      if (cleanPhone) {
        contact.phoneNumbers = [{ value: cleanPhone, type: 'mobile' }]
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
        if (!window.gapi?.client) {
          throw new Error('Google API client not initialized. Please refresh the page and try again.')
        }

        const token = window.gapi.client.getToken()
        if (!token?.access_token) {
          throw new Error(
            'Google session expired. Click “Google Connected” to sign in again, then retry the import.'
          )
        }

        const results = {
          total: processedData.length,
          created: 0,
          failed: 0,
          skipped: 0,
          errors: [] as string[],
        }

        const BATCH_SIZE = 200
        const people: Array<{ index: number; person: Record<string, unknown> }> = []
        for (let i = 0; i < processedData.length; i++) {
          const person = mapToGoogleContact(processedData[i])
          if (!person) {
            results.failed++
            results.errors.push(`Row ${i + 1}: Missing name field (SaveName or Name required)`)
            continue
          }
          people.push({ index: i, person })
        }
        onImportProgress?.(results.failed, processedData.length)

        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

        type PeopleResponse = { result?: { createdPeople?: unknown[]; resourceName?: string } }
        const peopleRequest = (path: string, body: unknown): Promise<PeopleResponse> =>
          window.gapi.client.request({
            path: `https://people.googleapis.com/v1/${path}`,
            method: 'POST',
            body,
          }) as Promise<PeopleResponse>

        const withAuthRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
          try {
            return await fn()
          } catch (error) {
            if (!isGoogleAuthError(error)) throw error
            const refreshed = await refreshAccessToken()
            if (!refreshed) throw error
            return await fn()
          }
        }

        let stoppedForAuth = false

        const importOne = async (item: { index: number; person: Record<string, unknown> }) => {
          const response = await withAuthRetry(() =>
            peopleRequest('people:createContact', item.person)
          )
          if (response.result) results.created++
          else {
            results.failed++
            results.errors.push(`Row ${item.index + 1}: Failed to create contact`)
          }
        }

        for (let start = 0; start < people.length; start += BATCH_SIZE) {
          const chunk = people.slice(start, start + BATCH_SIZE)
          try {
            const response = await withAuthRetry(() =>
              peopleRequest('people:batchCreateContacts', {
                contacts: chunk.map((item) => ({ contactPerson: item.person })),
                readMask: 'names,phoneNumbers,emailAddresses,birthdays',
              })
            )
            const created = Array.isArray(response.result?.createdPeople)
              ? response.result.createdPeople.length
              : chunk.length
            results.created += created
            if (created < chunk.length) {
              results.failed += chunk.length - created
            }
          } catch (error: unknown) {
            if (isGoogleAuthError(error)) {
              stoppedForAuth = true
              const remaining = people.length - start
              results.skipped = remaining
              results.errors.push(
                `Google session expired at row ${chunk[0].index + 1}. Stopped remaining ${remaining} contacts.`
              )
              console.error('Google Contacts batch auth error:', error)
              break
            }

            console.warn('Batch create failed, retrying contacts one by one:', error)
            for (const item of chunk) {
              try {
                await importOne(item)
              } catch (oneError: unknown) {
                if (isGoogleAuthError(oneError)) {
                  stoppedForAuth = true
                  const remaining = people.length - people.findIndex((row) => row.index === item.index)
                  results.skipped = remaining
                  results.errors.push(
                    `Row ${item.index + 1}: Google session expired. Stopped remaining ${remaining} contacts.`
                  )
                  break
                }
                results.failed++
                results.errors.push(`Row ${item.index + 1}: ${googleErrorMessage(oneError)}`)
              }
            }
            if (stoppedForAuth) break
          }

          onImportProgress?.(
            Math.min(processedData.length, results.created + results.failed + results.skipped),
            processedData.length
          )
          if (start + BATCH_SIZE < people.length) await sleep(250)
        }

        const message = stoppedForAuth
          ? `Imported ${results.created} contacts, then Google sign-in expired. ${results.failed} failed, ${results.skipped} not sent. Click “Google Connected” and import again.`
          : results.created > 0
            ? `Successfully imported ${results.created} contacts. ${results.failed} failed.`
            : `Failed to import contacts. ${results.failed} errors.`

        onImportResult?.({
          success: results.created > 0 && !stoppedForAuth,
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
    [isInitialized, isSignedIn, mapToGoogleContact, onImportResult, onImportProgress, refreshAccessToken]
  )

  // Expose methods via window object for use in parent component
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const integration = {
        signIn,
        signOut,
        prepareImport,
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
  }, [signIn, signOut, prepareImport, importContacts, isSignedIn, isLoading, isInitialized, CLIENT_ID, API_KEY])

  return null // This component doesn't render anything
}
