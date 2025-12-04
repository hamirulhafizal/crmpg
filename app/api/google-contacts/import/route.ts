/**
 * Google Contacts Import API Route
 * 
 * NOTE: This route is kept for backward compatibility but should NOT be used.
 * The Excel Processor page uses client-side OAuth integration directly via
 * GoogleContactsIntegration component, which imports contacts to the logged-in
 * user's Google Contacts using their OAuth token.
 * 
 * This server-side route should only be used if client-side integration fails
 * and you need server-side OAuth flow as a fallback.
 */
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { cookies } from 'next/headers'

interface ProcessedRow {
  [key: string]: any
  Name?: string
  SenderName?: string
  FirstName?: string
  Email?: string
  Phone?: string
  Telephone?: string
}

function mapToGoogleContact(row: ProcessedRow): any {
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
      givenName: givenName, // SenderName is used as First Name
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
    contact.phoneNumbers.push({
      value: phone,
      type: 'mobile',
    })
  }

  return contact
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CONTACTS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      return null
    }

    const tokens = await response.json()
    return tokens.access_token || null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const { processedData } = await request.json()

    if (!processedData || !Array.isArray(processedData) || processedData.length === 0) {
      return NextResponse.json(
        { error: 'No processed data provided' },
        { status: 400 }
      )
    }

    // Try OAuth first (preferred method for user consent)
    const cookieStore = await cookies()
    let accessToken = cookieStore.get('google_contacts_access_token')?.value
    const refreshToken = cookieStore.get('google_contacts_refresh_token')?.value

    let auth: any = null
    let authMethod = 'none'

    // Get OAuth client credentials
    const oauthClientId = process.env.GOOGLE_CONTACTS_CLIENT_ID
    const oauthClientSecret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_CONTACTS_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/auth/google-contacts/callback`

    // Method 1: Use OAuth tokens (user consent)
    if (accessToken || refreshToken) {
      // Check if OAuth credentials are configured
      if (!oauthClientId || !oauthClientSecret) {
        return NextResponse.json(
          { 
            error: 'OAuth credentials not configured',
            details: 'Please set GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET in your environment variables, or connect your Google account again.'
          },
          { status: 401 }
        )
      }

      // Initialize OAuth2 client with credentials
      auth = new google.auth.OAuth2(
        oauthClientId,
        oauthClientSecret,
        redirectUri
      )
      authMethod = 'oauth'

      if (accessToken) {
        // Use existing access token
        auth.setCredentials({ access_token: accessToken })
      } else if (refreshToken) {
        // Try to refresh the access token
        const newAccessToken = await refreshAccessToken(refreshToken)
        if (newAccessToken) {
          auth.setCredentials({ 
            access_token: newAccessToken,
            refresh_token: refreshToken,
          })
          // Update cookie with new access token
          cookieStore.set('google_contacts_access_token', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60, // 1 hour
          })
        } else {
          // Refresh failed - token may be revoked or credentials wrong
          return NextResponse.json(
            { 
              error: 'Google authorization failed',
              details: 'Unable to refresh access token. Please reconnect your Google account using the "Connect Google Contacts" button. Make sure GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET are correctly configured in your environment variables.'
            },
            { status: 401 }
          )
        }
      } else {
        // Neither token available
        auth = null
        authMethod = 'none'
      }
    }

    // No fallback to service account - we only use OAuth (user consent)
    // Contacts should be imported to the logged-in user's Google Contacts, not a service account
    if (!auth) {
      return NextResponse.json(
        { 
          error: 'Google authentication not available',
          details: 'Please connect your Google account using the "Connect Google Contacts" button on the Excel Processor page. This will use client-side OAuth to import contacts to your personal Google Contacts.',
          note: 'This API route should not be called directly. Use the client-side Google Contacts integration instead.'
        },
        { status: 401 }
      )
    }

    const people = google.people({
      version: 'v1',
      auth,
    })

    // Map processed data to Google Contacts format
    const contactsToCreate = processedData.map((row: ProcessedRow) => ({
      contactPerson: mapToGoogleContact(row),
    }))

    // Process in batches of 500 (Google API limit)
    const batchSize = 500
    const results = {
      total: contactsToCreate.length,
      created: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (let i = 0; i < contactsToCreate.length; i += batchSize) {
      const batch = contactsToCreate.slice(i, i + batchSize)

      try {
        const response = await people.people.batchCreateContacts({
          requestBody: {
            contacts: batch,
            readMask: 'names,emailAddresses,phoneNumbers',
          },
        })

        if (response.data.createdPeople) {
          results.created += response.data.createdPeople.length || batch.length
        }
      } catch (batchError: any) {
        console.error('Batch create error:', batchError)
        results.failed += batch.length
        
        // Provide clearer error messages based on error type
        let errorMessage = batchError.message || 'Unknown error'
        
        if (errorMessage.includes('unauthorized_client')) {
          errorMessage = 'OAuth authentication failed. Please reconnect your Google account using the "Connect Google Contacts" button. Make sure GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET are correctly configured.'
        } else if (errorMessage.includes('invalid_grant')) {
          errorMessage = 'Authorization expired or revoked. Please reconnect your Google account using the "Connect Google Contacts" button.'
        } else if (errorMessage.includes('insufficient_permission') || errorMessage.includes('permission_denied')) {
          errorMessage = 'Insufficient permissions. Please ensure you granted the contacts scope during OAuth authorization.'
        } else if (errorMessage.includes('invalid_request')) {
          errorMessage = 'Invalid request. Please check your OAuth credentials (GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET) are correctly configured.'
        }
        
        results.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorMessage}`)
      }

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < contactsToCreate.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return NextResponse.json({
      success: results.created > 0,
      results,
      message: `Successfully imported ${results.created} contacts to your Google Contacts. ${results.failed} failed.`,
    })
  } catch (error: any) {
    console.error('Google Contacts import error:', error)

    return NextResponse.json(
      { 
        error: error.message || 'Failed to import contacts to Google',
        details: error.response?.data || error.message
      },
      { status: 500 }
    )
  }
}
