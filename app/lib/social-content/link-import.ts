import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, chmod, writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import OpenAI from 'openai'
import { createRequire } from 'node:module'

import { DEALER_FOOTER } from '@/app/lib/social-content/categories'
import { normalizeVideoForStorage } from '@/app/lib/social-content/chrome-safe-video'

const require = createRequire(import.meta.url)

function resolveFfmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null
    return p && existsSync(p) ? p : null
  } catch {
    return null
  }
}

export type SocialLinkPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'unknown'

export type SocialLinkMeta = {
  platform: SocialLinkPlatform
  url: string
  title: string | null
  description: string | null
  authorName: string | null
  authorUsername: string | null
  thumbnailUrl: string | null
}

export type DownloadedSocialVideo = {
  buffer: Buffer
  mimeType: string
  filename: string
  meta: SocialLinkMeta
}

const MAX_VIDEO_BYTES = 95 * 1024 * 1024

const BIN_DIR = process.env.VERCEL
  ? path.join(tmpdir(), 'crmpg-bin')
  : path.join(process.cwd(), '.bin')
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

function createOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

export function normalizeSocialUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Paste a video link first.')
  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error('Invalid URL. Paste a full link from YouTube, Instagram, TikTok, or Facebook.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http(s) links are supported.')
  }
  return url.toString()
}

export function detectSocialPlatform(urlStr: string): SocialLinkPlatform {
  const host = new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase()
  if (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'm.youtube.com'
  ) {
    return 'youtube'
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'vm.tiktok.com') {
    return 'tiktok'
  }
  if (
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.watch' ||
    host === 'fb.com' ||
    host.endsWith('.fb.com')
  ) {
    return 'facebook'
  }
  return 'unknown'
}

function usernameFromUrl(platform: SocialLinkPlatform, urlStr: string): string | null {
  try {
    const u = new URL(urlStr)
    const parts = u.pathname.split('/').filter(Boolean)
    if (platform === 'instagram') {
      // /reel/CODE or /p/CODE or /username/...
      if (parts[0] === 'reel' || parts[0] === 'reels' || parts[0] === 'p' || parts[0] === 'tv') {
        return null
      }
      if (parts[0] && !['share', 'stories'].includes(parts[0])) return parts[0]
    }
    if (platform === 'tiktok') {
      const at = parts.find((p) => p.startsWith('@'))
      if (at) return at.replace(/^@/, '')
    }
    if (platform === 'youtube') {
      const at = parts.find((p) => p.startsWith('@'))
      if (at) return at.replace(/^@/, '')
    }
    if (platform === 'facebook') {
      if (parts[0] && !['share', 'reel', 'reels', 'watch', 'video', 'videos'].includes(parts[0])) {
        return parts[0]
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function sanitizeCreditHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^\w.\-]/g, '')
  return cleaned ? cleaned.slice(0, 64) : null
}

/** Prefer human handles over opaque YouTube/Facebook IDs. */
function pickCreditHandle(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const s = sanitizeCreditHandle(c)
    if (!s) continue
    if (/^UC[\w-]{20,}$/i.test(s)) continue
    // Facebook / numeric platform IDs — skip in favor of a display name.
    if (/^\d{8,}$/.test(s)) continue
    return s
  }
  return null
}

/**
 * Social downloads often land as VP9/AV1 or MP4s with edit-lists that freeze Chrome.
 * Re-encode via the shared storage normalizer (H.264 Baseline + AAC).
 */
async function normalizeDownloadedVideo(inputPath: string): Promise<{ path: string; mimeType: string }> {
  const raw = await readFile(inputPath)
  const normalized = await normalizeVideoForStorage(raw)
  const outPath = inputPath.replace(/(\.[^.]+)?$/, '') + '-h264.mp4'
  await writeFile(outPath, normalized.buffer)
  await unlink(inputPath).catch(() => {})
  return { path: outPath, mimeType: normalized.mimeType }
}

function ytDlpReleaseAsset(): string {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  // Linux serverless (Vercel) is x86_64.
  return 'yt-dlp_linux'
}

async function ensureYtDlpBinary(): Promise<string> {
  const envPath = process.env.YT_DLP_PATH?.trim()
  if (envPath && existsSync(envPath)) return envPath

  if (existsSync(BIN_PATH)) return BIN_PATH

  await mkdir(BIN_DIR, { recursive: true })
  const asset = ytDlpReleaseAsset()
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
  const res = await fetch(downloadUrl, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Failed to download yt-dlp (${res.status}). Set YT_DLP_PATH or COBALT_API_URL.`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(BIN_PATH, buf)
  if (process.platform !== 'win32') {
    await chmod(BIN_PATH, 0o755)
  }
  return BIN_PATH
}

function runYtDlp(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error((stderr || stdout || `yt-dlp exited ${code}`).slice(0, 500)))
    })
  })
}

async function runYtDlpJson(bin: string, url: string, cookieArgs: string[]): Promise<Record<string, unknown>> {
  const stdout = await runYtDlp(bin, [
    url,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    ...cookieArgs,
  ])
  return JSON.parse(stdout) as Record<string, unknown>
}

async function downloadWithYtDlp(bin: string, url: string): Promise<{
  buffer: Buffer
  mimeType: string
  filename: string
  meta: SocialLinkMeta
}> {
  const platform = detectSocialPlatform(url)
  const cookieFile = await prepareYtDlpCookiesFile()
  const cookieArgs = cookieFile ? ['--cookies', cookieFile] : []

  let info: Record<string, unknown> = {}
  try {
    info = await runYtDlpJson(bin, url, cookieArgs)
  } catch {
    info = {}
  }

  const title = typeof info.title === 'string' ? info.title : null
  const description =
    typeof info.description === 'string'
      ? info.description
      : typeof info.fulltitle === 'string'
        ? info.fulltitle
        : null
  const authorName =
    (typeof info.uploader === 'string' && info.uploader) ||
    (typeof info.creator === 'string' && info.creator) ||
    (typeof info.channel === 'string' && info.channel) ||
    null
  const authorUsername =
    pickCreditHandle(
      typeof info.uploader_id === 'string' ? info.uploader_id : null,
      typeof info.channel_url === 'string' ? info.channel_url.split('/').pop() : null,
      typeof info.uploader === 'string' ? info.uploader : null,
      typeof info.creator === 'string' ? info.creator : null,
      usernameFromUrl(platform, url)
    )
  const thumbnailUrl =
    (typeof info.thumbnail === 'string' && info.thumbnail) ||
    (Array.isArray(info.thumbnails) &&
    info.thumbnails.length &&
    typeof (info.thumbnails[info.thumbnails.length - 1] as { url?: string })?.url === 'string'
      ? (info.thumbnails[info.thumbnails.length - 1] as { url: string }).url
      : null)

  const meta: SocialLinkMeta = {
    platform,
    url,
    title,
    description: description?.slice(0, 2000) || null,
    authorName,
    authorUsername,
    thumbnailUrl,
  }

  const idHash = createHash('sha1').update(url).digest('hex').slice(0, 10)
  const outPath = path.join(tmpdir(), `crmpg-social-${idHash}-${Date.now()}.mp4`)

  const ffmpeg = resolveFfmpegPath()
  const ffmpegArgs = ffmpeg ? ['--ffmpeg-location', ffmpeg] : []

  // Merge video+audio when possible (YouTube Shorts rarely ship progressive mp4).
  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
    ...cookieArgs,
    ...ffmpegArgs,
    '-f',
    // Prefer H.264 when available; we still normalize to H.264+AAC afterward.
    'bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/bv*[height<=1080]+ba/b',
    '--merge-output-format',
    'mp4',
    '-o',
    outPath,
    '--max-filesize',
    String(MAX_VIDEO_BYTES),
  ]

  try {
    await runYtDlp(bin, args)
  } catch (e) {
    try {
      await runYtDlp(bin, [
        url,
        '--no-playlist',
        '--no-warnings',
        ...cookieArgs,
        ...ffmpegArgs,
        '-f',
        'best/b',
        '-o',
        outPath,
        '--max-filesize',
        String(MAX_VIDEO_BYTES),
      ])
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : e instanceof Error ? e.message : 'Download failed'
      throw new Error(
        platform === 'instagram' || platform === 'facebook'
          ? `Could not download this ${platform} video (often needs login cookies). Try YouTube/TikTok, or set SOCIAL_YTDLP_COOKIES / COBALT_API_URL. (${msg.slice(0, 180)})`
          : `Could not download video: ${msg.slice(0, 220)}`
      )
    }
  }

  let finalPath = outPath
  let mimeType = 'video/mp4'
  try {
    const normalized = await normalizeDownloadedVideo(outPath)
    finalPath = normalized.path
    mimeType = normalized.mimeType
  } catch (e) {
    // Do not store Chrome-breaking originals from social downloads.
    await unlink(outPath).catch(() => {})
    const details = e instanceof Error ? e.message : String(e)
    throw new Error(`Could not convert downloaded video to browser-safe MP4: ${details.slice(0, 220)}`)
  }

  let buffer: Buffer
  try {
    buffer = await readFile(finalPath)
  } finally {
    await unlink(finalPath).catch(() => {})
    if (finalPath !== outPath) await unlink(outPath).catch(() => {})
  }

  if (!buffer.length) throw new Error('Downloaded file is empty.')
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error('Downloaded video is larger than 95 MB. Pick a shorter clip.')
  }

  const safeTitle = (title || `${platform}-video`).replace(/[^\w.\-]+/g, '_').slice(0, 40)
  const filename = `${safeTitle || 'social-video'}.mp4`

  return { buffer, mimeType, filename, meta }
}

type CobaltResponse = {
  status?: string
  url?: string
  filename?: string
  error?: { code?: string; message?: string } | string
  text?: string
  picker?: Array<{ url?: string; type?: string }>
}

async function downloadWithCobalt(url: string): Promise<DownloadedSocialVideo | null> {
  const base = process.env.COBALT_API_URL?.trim().replace(/\/$/, '')
  if (!base) return null

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const apiKey = process.env.COBALT_API_KEY?.trim()
  if (apiKey) headers.Authorization = `Api-Key ${apiKey}`

  const res = await fetch(`${base}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url,
      videoQuality: '720',
      downloadMode: 'auto',
      filenameStyle: 'basic',
    }),
  })
  const json = (await res.json().catch(() => ({}))) as CobaltResponse
  if (!res.ok) {
    const err =
      typeof json.error === 'string'
        ? json.error
        : json.error?.code || json.text || `Cobalt HTTP ${res.status}`
    throw new Error(`Cobalt download failed: ${err}`)
  }

  let fileUrl = json.url
  if (!fileUrl && Array.isArray(json.picker)) {
    const video = json.picker.find((p) => p.type === 'video' && p.url) || json.picker.find((p) => p.url)
    fileUrl = video?.url
  }
  if (!fileUrl) {
    throw new Error(`Cobalt returned no file (status=${json.status || 'unknown'}).`)
  }

  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) throw new Error(`Cobalt tunnel failed (${fileRes.status}).`)
  const buffer = Buffer.from(await fileRes.arrayBuffer())
  if (!buffer.length) throw new Error('Cobalt returned an empty file.')
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error('Downloaded video is larger than 95 MB. Pick a shorter clip.')
  }

  const platform = detectSocialPlatform(url)
  const filename =
    (typeof json.filename === 'string' && json.filename) ||
    `${platform}-video.mp4`
  const mimeType = fileRes.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4'

  return {
    buffer,
    mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4',
    filename,
    meta: {
      platform,
      url,
      title: null,
      description: null,
      authorName: null,
      authorUsername: usernameFromUrl(platform, url),
      thumbnailUrl: null,
    },
  }
}

async function enrichMetaFromOEmbed(meta: SocialLinkMeta): Promise<SocialLinkMeta> {
  if (meta.platform !== 'youtube') return meta
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(meta.url)}&format=json`
    const res = await fetch(oembedUrl)
    if (!res.ok) return meta
    const data = (await res.json()) as {
      title?: string
      author_name?: string
      author_url?: string
      thumbnail_url?: string
    }
    const handleFromAuthorUrl = data.author_url
      ? sanitizeCreditHandle(data.author_url.split('/').pop() || null)
      : null
    return {
      ...meta,
      title: meta.title || data.title || null,
      authorName: meta.authorName || data.author_name || null,
      authorUsername: meta.authorUsername || handleFromAuthorUrl || sanitizeCreditHandle(data.author_name),
      thumbnailUrl: meta.thumbnailUrl || data.thumbnail_url || null,
    }
  } catch {
    return meta
  }
}

/** Download a public social video (Cobalt if configured, else yt-dlp). */
export async function downloadSocialVideo(rawUrl: string): Promise<DownloadedSocialVideo> {
  const url = normalizeSocialUrl(rawUrl)
  const platform = detectSocialPlatform(url)
  if (platform === 'unknown') {
    throw new Error('Supported platforms: YouTube, Instagram, TikTok, Facebook.')
  }

  const cobalt = await downloadWithCobalt(url).catch((e) => {
    // Only hard-fail if Cobalt is the only configured path and yt-dlp is disabled.
    if (process.env.SOCIAL_LINK_COBALT_ONLY === '1') throw e
    console.warn('[link-import] cobalt failed, falling back to yt-dlp:', e)
    return null
  })

  if (cobalt) {
    const idHash = createHash('sha1').update(url).digest('hex').slice(0, 10)
    const tmpPath = path.join(tmpdir(), `crmpg-cobalt-${idHash}-${Date.now()}.mp4`)
    await writeFile(tmpPath, cobalt.buffer)
    let buffer: Buffer
    let mimeType: string
    const filename = cobalt.filename.replace(/\.[^.]+$/, '') + '.mp4'
    try {
      const normalized = await normalizeDownloadedVideo(tmpPath)
      buffer = await readFile(normalized.path)
      mimeType = normalized.mimeType
      await unlink(normalized.path).catch(() => {})
    } catch (e) {
      await unlink(tmpPath).catch(() => {})
      const details = e instanceof Error ? e.message : String(e)
      throw new Error(`Could not convert Cobalt video to browser-safe MP4: ${details.slice(0, 220)}`)
    }

    return {
      buffer,
      mimeType,
      filename,
      meta: await enrichMetaFromOEmbed({
        ...cobalt.meta,
        authorUsername:
          cobalt.meta.authorUsername || usernameFromUrl(platform, url),
      }),
    }
  }

  const bin = await ensureYtDlpBinary()
  const downloaded = await downloadWithYtDlp(bin, url)
  return {
    ...downloaded,
    meta: await enrichMetaFromOEmbed(downloaded.meta),
  }
}

export type DealerCta = {
  profileUrl: string
  whatsappDisplay: string
  whatsappLink: string
}

export function buildDealerCta(input: {
  usernamePbo?: string | null
  phone?: string | null
}): DealerCta {
  const username =
    (input.usernamePbo || '').trim().replace(/^@/, '') ||
    process.env.SOCIAL_CTA_USERNAME?.trim() ||
    'hamirulhafizal'
  const profileUrl =
    process.env.SOCIAL_CTA_PROFILE_URL?.trim() || `https://pg2u.my/${username}`

  const digits = (input.phone || process.env.SOCIAL_CTA_WHATSAPP || '')
    .replace(/\D/g, '')
  let msisdn = digits
  if (msisdn.startsWith('0') && msisdn.length >= 9) {
    msisdn = `60${msisdn.slice(1)}`
  } else if (msisdn.length >= 9 && !msisdn.startsWith('60')) {
    msisdn = `60${msisdn}`
  }

  const whatsappDisplay = msisdn || 'Set phone in Profile'
  const whatsappLink = msisdn
    ? `https://wa.me/${msisdn}`
    : profileUrl

  return { profileUrl, whatsappDisplay, whatsappLink }
}

function buildTemplateRepostCaption(input: {
  meta: SocialLinkMeta
  cta: DealerCta
}): string {
  const credit =
    sanitizeCreditHandle(input.meta.authorUsername) ||
    sanitizeCreditHandle(input.meta.authorName) ||
    'pemilik_asal'
  const hint = (input.meta.title || input.meta.description || 'video ni').slice(0, 140)

  return [
    'Video ni buat kita fikir sekejap…',
    '',
    `Plot twist: apa yang anda tengok (${hint}) boleh jadi pengingat — nilai & disiplin lebih penting dari “nanti-nanti”.`,
    '',
    'Kalau ready nak mula simpan emas / tahu next step — jom connect.',
    `Link: ${input.cta.profileUrl}`,
    `WhatsApp: ${input.cta.whatsappDisplay}`,
    '',
    `Kredit: @${credit}`,
    DEALER_FOOTER,
  ].join('\n')
}

/** BM caption from video context + credit + CTA (profile + WhatsApp). */
export async function generateRepostCaption(input: {
  meta: SocialLinkMeta
  cta: DealerCta
}): Promise<{ caption: string; source: 'hybrid' | 'template' }> {
  const template = buildTemplateRepostCaption(input)
  const credit =
    sanitizeCreditHandle(input.meta.authorUsername) ||
    sanitizeCreditHandle(input.meta.authorName) ||
    'pemilik_asal'

  const openai = createOpenAIClient()
  if (!openai) return { caption: template, source: 'template' }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_SOCIAL_CAPTION?.trim() || 'gpt-4o-mini',
      temperature: 0.85,
      max_tokens: 480,
      messages: [
        {
          role: 'system',
          content: `Anda copywriter sosial media Bahasa Melayu (100% BM, tiada English kecuali nama produk/handle).
Tulis caption pendek-sederhana untuk Instagram/TikTok/Facebook/YouTube Shorts berdasarkan konteks video yang di-repost.

WAJIB struktur:
1) Hook negatif (sakit/keraguan audience) berkaitan tema video
2) Plot twist positif (nilai, disiplin, peluang emas / mindset)
3) Kaitkan dengan konteks video (tajuk/caption asal) — jangan ignore
4) CTA jelas dengan DUA baris EXACT ini (jangan ubah URL/nombor):
Link: ${input.cta.profileUrl}
WhatsApp: ${input.cta.whatsappDisplay}
5) Credit EXACT satu baris: Kredit: @${credit}
6) Tutup EXACT dengan footer dealer tanpa ubah:
${DEALER_FOOTER}

Elak emoji berlebihan. Nada motivate + engaging. Jangan tipu claim. Jangan padam credit.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            platform: input.meta.platform,
            source_url: input.meta.url,
            tajuk: input.meta.title,
            caption_asal: input.meta.description,
            pemilik: input.meta.authorName,
            handle: credit,
          }),
        },
      ],
    })

    let text = completion.choices[0]?.message?.content?.trim()
    if (!text) return { caption: template, source: 'template' }

    if (!/Kredit:\s*@/i.test(text)) {
      text = `${text.trim()}\n\nKredit: @${credit}`
    }
    if (!text.includes(input.cta.profileUrl)) {
      text = `${text.trim()}\nLink: ${input.cta.profileUrl}`
    }
    if (!text.includes(input.cta.whatsappDisplay) && input.cta.whatsappDisplay !== 'Set phone in Profile') {
      text = `${text.trim()}\nWhatsApp: ${input.cta.whatsappDisplay}`
    }
    if (!text.includes('PG00104897')) {
      text = `${text.trim()}\n${DEALER_FOOTER}`
    }

    return { caption: text, source: 'hybrid' }
  } catch {
    return { caption: template, source: 'template' }
  }
}

/** Optional: write cookies file path for Instagram/Facebook if SOCIAL_YTDLP_COOKIES is set. */
export async function prepareYtDlpCookiesFile(): Promise<string | null> {
  const raw = process.env.SOCIAL_YTDLP_COOKIES?.trim()
  if (!raw) return null
  const cookiePath = path.join(tmpdir(), 'crmpg-ytdlp-cookies.txt')
  await writeFile(cookiePath, raw, 'utf8')
  return cookiePath
}

/** Health helper — ensures binary can start. */
export async function probeYtDlp(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const bin = await ensureYtDlpBinary()
    const version = (await runYtDlp(bin, ['--version'])).trim()
    return { ok: true, version }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'yt-dlp probe failed' }
  }
}
