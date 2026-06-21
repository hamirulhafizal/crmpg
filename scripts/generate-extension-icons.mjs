import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../extension/ikfaidmmhokhgocfhhddhlahmbikjaed')

function crmpgIconSvg(size) {
  const fontSize = size <= 16 ? 5.5 : size <= 48 ? 13 : 30
  const radius = Math.round(size * 0.22)
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
    fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
    font-weight="800" font-size="${fontSize}" letter-spacing="-0.4">CRMPG</text>
</svg>`)
}

async function writeIcon(size, filename) {
  const png = await sharp(crmpgIconSvg(size)).png().toBuffer()
  fs.writeFileSync(path.join(outDir, filename), png)
  console.log(`Wrote ${filename} (${size}x${size})`)
}

await writeIcon(128, 'icon.png')
await writeIcon(128, 'icon-128.png')
await writeIcon(48, 'icon-48.png')
await writeIcon(16, 'icon-16.png')
