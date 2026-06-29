import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { PassThrough } from 'stream'
import { finished } from 'stream/promises'

const EXTENSION_DIR = path.join(process.cwd(), 'extension/ikfaidmmhokhgocfhhddhlahmbikjaed')
const OUTPUT_DIR = path.join(process.cwd(), 'dist')
const OUTPUT_ZIP = path.join(OUTPUT_DIR, 'CRMPG-by-KEM.zip')

const SKIP_FILES = new Set([
  'config.example.js',
  'mockupdata.html',
  'test.js',
])

function buildConfigJs() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const webappOrigin = process.env.WEBAPP_ORIGIN || process.env.NEXT_PUBLIC_WEBAPP_ORIGIN || 'https://crmpg.vercel.app'
  const storeUrl = process.env.CHROME_WEB_STORE_EXTENSION_URL || ''

  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_ANON_KEY for extension build.')
  }

  return `const SUPABASE_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)},
  WEBAPP_ORIGIN: ${JSON.stringify(webappOrigin)},
  CHROME_WEB_STORE_URL: ${JSON.stringify(storeUrl)},
};
`
}

async function writeTempConfig() {
  const tempDir = path.join(OUTPUT_DIR, 'extension-build')
  const targetDir = path.join(tempDir, 'ikfaidmmhokhgocfhhddhlahmbikjaed')

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  fs.mkdirSync(targetDir, { recursive: true })

  for (const entry of fs.readdirSync(EXTENSION_DIR, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue

    const sourcePath = path.join(EXTENSION_DIR, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true })
    } else if (entry.name === 'config.js') {
      fs.writeFileSync(targetPath, buildConfigJs(), 'utf8')
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }

  if (!fs.existsSync(path.join(targetDir, 'config.js'))) {
    fs.writeFileSync(path.join(targetDir, 'config.js'), buildConfigJs(), 'utf8')
  }

  return targetDir
}

async function zipDirectory(sourceDir, zipPath) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true })

  const output = fs.createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const done = finished(output)

  archive.pipe(output)
  archive.directory(sourceDir, false)
  await archive.finalize()
  await done
}

async function main() {
  if (!fs.existsSync(EXTENSION_DIR)) {
    throw new Error(`Extension directory not found: ${EXTENSION_DIR}`)
  }

  const builtDir = await writeTempConfig()
  await zipDirectory(builtDir, OUTPUT_ZIP)

  const manifest = JSON.parse(
    fs.readFileSync(path.join(builtDir, 'manifest.json'), 'utf8')
  )

  console.log(`Built ${OUTPUT_ZIP}`)
  console.log(`Version: ${manifest.version}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
