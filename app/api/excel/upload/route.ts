import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse Excel file
    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' })
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Failed to parse Excel file. Please ensure the file is not corrupted.' },
        { status: 400 }
      )
    }

    // Get first sheet
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return NextResponse.json(
        { error: 'No sheets found in the Excel file' },
        { status: 400 }
      )
    }

    const worksheet = workbook.Sheets[firstSheetName]

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false })

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json(
        { error: 'No data found in the Excel file' },
        { status: 400 }
      )
    }

    // Get headers
    const headers = Object.keys(jsonData[0] as Record<string, any>)

    return NextResponse.json({
      success: true,
      data: jsonData,
      headers,
      sheetName: firstSheetName,
      rowCount: jsonData.length,
    })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload and parse file' },
      { status: 500 }
    )
  }
}

