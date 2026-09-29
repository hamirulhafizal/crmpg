/**
 * Shrink campaign images before WAHA sendImage.
 * Large PNGs (~2–3MB+) often crash WhatsApp Web with the memoize/"id property" error.
 */

export type WhatsAppReadyImage = {
  bytes: Buffer
  mimetype: 'image/jpeg'
  filename: string
  /** Original PNG size before compress */
  sourceBytes: number
  width: number
  height: number
  quality: number
}

const MAX_EDGE_PX = 1600
const TARGET_MAX_BYTES = 900_000
const QUALITY_STEPS = [82, 72, 62, 52] as const

export async function compressCampaignImageForWhatsApp(
  pngBytes: Buffer
): Promise<WhatsAppReadyImage> {
  const sharp = (await import('sharp')).default
  const sourceBytes = pngBytes.length

  const meta = await sharp(pngBytes, { failOn: 'none' }).metadata()
  const srcW = meta.width ?? 0
  const srcH = meta.height ?? 0
  const needsResize = srcW > MAX_EDGE_PX || srcH > MAX_EDGE_PX

  let best: WhatsAppReadyImage | null = null

  for (const quality of QUALITY_STEPS) {
    let pipeline = sharp(pngBytes, { failOn: 'none' }).rotate()
    if (needsResize) {
      pipeline = pipeline.resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    const { data, info } = await pipeline
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toBuffer({ resolveWithObject: true })

    best = {
      bytes: data,
      mimetype: 'image/jpeg',
      filename: 'campaign-image.jpg',
      sourceBytes,
      width: info.width,
      height: info.height,
      quality,
    }

    if (data.length <= TARGET_MAX_BYTES) break
  }

  if (!best || !best.bytes.length) {
    throw new Error('WhatsApp image compress produced an empty file')
  }

  console.log('[campaign-image] compressed for whatsapp', {
    sourceBytes,
    outBytes: best.bytes.length,
    ratio: Number((best.bytes.length / Math.max(1, sourceBytes)).toFixed(3)),
    width: best.width,
    height: best.height,
    quality: best.quality,
    maxEdgePx: MAX_EDGE_PX,
    targetMaxBytes: TARGET_MAX_BYTES,
  })

  return best
}
