import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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

function run(bin: string, args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: process.env })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stderr })
      else reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`))
    })
  })
}

/** Probe via `ffmpeg -i` stderr (no ffprobe dependency). */
async function inputHasAudio(ffmpeg: string, inPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-i', inPath], { env: process.env })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', () => resolve(false))
    child.on('close', () => {
      resolve(/^\s*Stream #\d+:\d+.*Audio:/m.test(stderr))
    })
  })
}

export type NormalizedVideo = {
  buffer: Buffer
  mimeType: 'video/mp4'
  extension: 'mp4'
  /** True when bytes were re-encoded (vs passed through). */
  transcoded: boolean
  hasAudio: boolean
}

const VIDEO_FILTER =
  'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS,format=yuv420p'

/**
 * Keep audio continuous and Chrome-decodable.
 * Avoid asetpts/first_pts tricks that can leave a silent AAC track in Chromium
 * even though the file still "has" an audio stream.
 */
const AUDIO_FILTER =
  'aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=44100:async=1:first_pts=0'

function baseVideoArgs(inPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    // Ignore broken edit lists that freeze Chrome while Safari still plays.
    '-advanced_editlist',
    '0',
    '-i',
    inPath,
    '-map',
    '0:v:0',
    '-vf',
    VIDEO_FILTER,
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.1',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-x264-params',
    'bframes=0:aud=1',
  ]
}

function audioEncodeArgs(): string[] {
  return [
    '-map',
    '0:a:0',
    '-af',
    AUDIO_FILTER,
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-b:a',
    '160k',
  ]
}

/**
 * Storage-grade browser-safe MP4 for Chrome + Safari + social platforms.
 *
 * Many phone / TryPost / yt-dlp exports freeze Chromium on frame 0 because of
 * MP4 edit lists (elst), odd dimensions, B-frames, or non-H.264 codecs.
 * Always re-encode to H.264 Baseline + AAC with reset video timestamps and faststart.
 */
export async function normalizeVideoForStorage(input: Buffer): Promise<NormalizedVideo> {
  if (!input.length) throw new Error('Video file is empty')

  const ffmpeg = resolveFfmpegPath()
  if (!ffmpeg) {
    throw new Error('ffmpeg-static is not available — cannot normalize video for browser playback')
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'crmpg-store-'))
  const inPath = path.join(dir, 'in.bin')
  const outPath = path.join(dir, 'out.mp4')

  try {
    await writeFile(inPath, input)
    const hasAudio = await inputHasAudio(ffmpeg, inPath)

    const args = [
      ...baseVideoArgs(inPath),
      ...(hasAudio ? audioEncodeArgs() : ['-an']),
      // isom brand (avoid iso4 from negative_cts_offsets — some Chrome builds drop audio)
      '-movflags',
      '+faststart',
      outPath,
    ]

    await run(ffmpeg, args)

    const buffer = await readFile(outPath)
    if (!buffer.length) throw new Error('Normalized video is empty')

    return {
      buffer,
      mimeType: 'video/mp4',
      extension: 'mp4',
      transcoded: true,
      hasAudio,
    }
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}

/**
 * Force `.mp4` extension after storage normalize (platforms expect MP4).
 */
export function withMp4Filename(originalFilename: string): string {
  const base = originalFilename.replace(/\.[^.]+$/, '') || 'video'
  return `${base}.mp4`
}

export type ChromeSafeResult = {
  buffer: Buffer
  mimeType: string
  extension: 'webm' | 'mp4'
}

/**
 * On-the-fly preview for legacy / external CDN files that were never normalized.
 * Prefer WebM for Chromium; fall back to baseline MP4.
 */
export async function toChromeSafePreview(input: Buffer): Promise<ChromeSafeResult> {
  const ffmpeg = resolveFfmpegPath()
  if (!ffmpeg) throw new Error('ffmpeg-static is not available')

  const dir = await mkdtemp(path.join(tmpdir(), 'crmpg-vid-'))
  const inPath = path.join(dir, 'in.bin')
  const webmPath = path.join(dir, 'out.webm')

  try {
    await writeFile(inPath, input)
    const hasAudio = await inputHasAudio(ffmpeg, inPath)

    try {
      const webmArgs = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-advanced_editlist',
        '0',
        '-i',
        inPath,
        '-map',
        '0:v:0',
        '-vf',
        VIDEO_FILTER,
        '-c:v',
        'libvpx',
        '-b:v',
        '1M',
        '-deadline',
        'good',
        '-cpu-used',
        '4',
        '-auto-alt-ref',
        '0',
      ]
      if (hasAudio) {
        webmArgs.push(
          '-map',
          '0:a:0',
          '-af',
          AUDIO_FILTER,
          '-c:a',
          'libopus',
          '-b:a',
          '96k',
          '-ac',
          '2',
          '-ar',
          '48000'
        )
      } else {
        webmArgs.push('-an')
      }
      webmArgs.push(webmPath)

      await run(ffmpeg, webmArgs)
      const buffer = await readFile(webmPath)
      if (buffer.length > 0) {
        return { buffer, mimeType: 'video/webm', extension: 'webm' }
      }
    } catch (e) {
      console.warn('[chrome-safe] webm encode failed, trying mp4:', e)
    }

    const stored = await normalizeVideoForStorage(input)
    return {
      buffer: stored.buffer,
      mimeType: stored.mimeType,
      extension: stored.extension,
    }
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(webmPath).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}

/** @deprecated use toChromeSafePreview / normalizeVideoForStorage */
export async function toChromeSafeMp4(input: Buffer): Promise<Buffer> {
  const result = await normalizeVideoForStorage(input)
  return result.buffer
}
