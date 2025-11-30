import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { DEFAULT_PROMPT_TEMPLATE, buildPrompt } from '@/app/lib/prompts/default-prompt'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { rowData, rowNumber, customPrompt } = await request.json()

    if (!rowData) {
      return NextResponse.json(
        { error: 'Row data is required' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_SECRET_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured',
          details: 'Please set OPENAI_SECRET_KEY or OPENAI_API_KEY in your environment variables.'
        },
        { status: 500 }
      )
    }

    // Extract Name and D.O.B. from row data (case-insensitive)
    const name = rowData.Name || rowData.name || rowData['Full Name'] || rowData['Full name'] || ''
    const dob = rowData['D.O.B.'] || rowData['D.O.B'] || rowData.DOB || rowData.dob || rowData['Date of Birth'] || rowData['Date of birth'] || ''
    const pgCode = rowData.PGCode || rowData['PG Code'] || rowData['PG code'] || ''

    if (!name) {
      return NextResponse.json(
        { error: 'Name field not found in row data' },
        { status: 400 }
      )
    }

    // Use custom prompt if provided, otherwise use default
    const promptTemplate = customPrompt || DEFAULT_PROMPT_TEMPLATE
    const prompt = buildPrompt(promptTemplate, name, dob, rowNumber || 1, pgCode)

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini as it's cost-effective, you can change to gpt-4 or gpt-3.5-turbo
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that returns only valid JSON objects. Always respond with JSON format only, no additional text or explanation.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent results
      response_format: { type: 'json_object' }, // Force JSON response
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response
    let result
    try {
      result = JSON.parse(content)
    } catch (parseError) {
      // Try to extract JSON from response if it's wrapped in text
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse OpenAI response as JSON')
      }
    }

    // Validate required fields
    const requiredFields = ['Gender', 'Ethnicity', 'Age', 'Prefix', 'FirstName', 'SenderName']
    const missingFields = requiredFields.filter(field => !result[field])

    if (missingFields.length > 0) {
      console.warn(`Missing fields in OpenAI response: ${missingFields.join(', ')}`)
    }

    // Ensure row_number is set
    result.row_number = rowNumber || result.row_number || 1

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error: any) {
    console.error('Error processing row with OpenAI:', error)
    
    // Handle OpenAI API errors
    if (error.status === 401) {
      return NextResponse.json(
        { 
          error: 'Invalid OpenAI API key',
          details: 'Please check your OPENAI_SECRET_KEY or OPENAI_API_KEY environment variable.'
        },
        { status: 401 }
      )
    }

    if (error.status === 429) {
      return NextResponse.json(
        { 
          error: 'OpenAI API rate limit exceeded',
          details: 'Please wait a moment before trying again.'
        },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { 
        error: error.message || 'Failed to process row with OpenAI',
        details: error.response?.data || error.message
      },
      { status: 500 }
    )
  }
}

