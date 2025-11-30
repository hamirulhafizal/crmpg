import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: Request) {
  try {
    const { data, originalHeaders } = await request.json()

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'No data provided to generate Excel file' },
        { status: 400 }
      )
    }

    // Create a new workbook
    const workbook = XLSX.utils.book_new()

    // Convert data array to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data, {
      header: Object.keys(data[0]),
    })

    // Set column widths for better readability
    const maxWidth = 50
    const minWidth = 10
    const colWidths: { wch: number }[] = []
    
    const headers = Object.keys(data[0])
    headers.forEach((header) => {
      const maxLength = Math.max(
        header.length,
        ...data.map((row: any) => {
          const value = row[header]
          return value ? String(value).length : 0
        })
      )
      colWidths.push({
        wch: Math.min(Math.max(maxLength + 2, minWidth), maxWidth),
      })
    })
    worksheet['!cols'] = colWidths

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Data')

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    // Return as blob
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="processed_data_${Date.now()}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating Excel file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate Excel file' },
      { status: 500 }
    )
  }
}

