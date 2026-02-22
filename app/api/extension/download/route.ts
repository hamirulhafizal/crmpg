import { createClient } from '@/app/lib/supabase/server'
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { Readable } from 'stream'

const EXTENSION_DIR = 'extension/ikfaidmmhokhgocfhhddhlahmbikjaed'
const ZIP_NAME = 'CRMPG-by-KEM.zip'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cwd = process.cwd()
    const extensionPath = path.join(cwd, EXTENSION_DIR)

    if (!fs.existsSync(extensionPath)) {
      return NextResponse.json(
        { error: 'Extension folder not found' },
        { status: 404 }
      )
    }

    const archive = archiver('zip', { zlib: { level: 9 } })
    const passThrough = new PassThrough()

    archive.pipe(passThrough)
    archive.directory(extensionPath, false)
    archive.finalize()

    const webStream = Readable.toWeb(passThrough) as ReadableStream

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${ZIP_NAME}"`,
      },
    })
  } catch (err) {
    console.error('Extension download error:', err)
    return NextResponse.json(
      { error: 'Failed to create extension zip' },
      { status: 500 }
    )
  }
}
