import { NextResponse } from 'next/server'
import { google } from 'googleapis'

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

export async function POST(request: Request) {
  try {
    // Get service account credentials from environment
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    const serviceAccountKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
    const targetUserEmail = process.env.GOOGLE_CONTACTS_TARGET_USER_EMAIL

    // Initialize service account auth
    let serviceAccountAuth: any

    if (serviceAccountKeyFile) {
      // Option 1: Load from JSON file path
      try {
        const fs = await import('fs/promises')
        const path = await import('path')
        const keyData = await fs.readFile(path.resolve(process.cwd(), serviceAccountKeyFile), 'utf-8')
        const keyJson = JSON.parse(keyData)
        
        serviceAccountAuth = new google.auth.JWT({
          email: keyJson.client_email,
          key: keyJson.private_key,
          scopes: ['https://www.googleapis.com/auth/contacts'],
          subject: targetUserEmail || undefined, // Impersonate this user (requires domain-wide delegation)
        })
      } catch (fileError: any) {
        return NextResponse.json(
          { 
            error: 'Failed to load service account key file',
            details: fileError.message
          },
          { status: 500 }
        )
      }
    } else if (serviceAccountEmail && serviceAccountKey) {
      // Option 2: Use environment variables
      serviceAccountAuth = new google.auth.JWT({
        email: serviceAccountEmail,
        key: serviceAccountKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        scopes: ['https://www.googleapis.com/auth/contacts'],
        subject: targetUserEmail || undefined, // Impersonate this user (requires domain-wide delegation)
      })
    } else {
      return NextResponse.json(
        { 
          error: 'Google Service Account not configured',
          details: 'Please set either GOOGLE_SERVICE_ACCOUNT_KEY_FILE (path to JSON file) OR GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in your environment variables.'
        },
        { status: 500 }
      )
    }

    // Target user email is recommended but not required if not using domain-wide delegation
    // (for shared contacts or other use cases)

    const { processedData } = await request.json()

    if (!processedData || !Array.isArray(processedData) || processedData.length === 0) {
      return NextResponse.json(
        { error: 'No processed data provided' },
        { status: 400 }
      )
    }

    const people = google.people({
      version: 'v1',
      auth: serviceAccountAuth,
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
        results.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError.message}`)
      }

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < contactsToCreate.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Successfully imported ${results.created} contacts to ${targetUserEmail}. ${results.failed} failed.`,
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
