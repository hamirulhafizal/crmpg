import fs from 'fs'
import path from 'path'

const EXTENSION_DIR = 'extension/ikfaidmmhokhgocfhhddhlahmbikjaed'
const MANIFEST_PATH = path.join(process.cwd(), EXTENSION_DIR, 'manifest.json')

export type ExtensionVersionInfo = {
  latestVersion: string
  minVersion: string
  storeUrl: string
  updateRequired: boolean
}

type ExtensionManifest = {
  version?: string
}

export function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareSemver(a: string, b: string): number {
  const av = parseSemver(a)
  const bv = parseSemver(b)
  if (!av && !bv) return 0
  if (!av) return -1
  if (!bv) return 1

  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1
    if (av[i] < bv[i]) return -1
  }
  return 0
}

export function readExtensionManifest(): ExtensionManifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8')
  return JSON.parse(raw) as ExtensionManifest
}

export function getExtensionVersionInfo(clientVersion?: string | null): ExtensionVersionInfo {
  const manifest = readExtensionManifest()
  const latestVersion = manifest.version || '0.0.0'
  const minVersion = process.env.EXTENSION_MIN_VERSION?.trim() || latestVersion
  const storeUrl = process.env.CHROME_WEB_STORE_EXTENSION_URL?.trim() || ''
  const updateRequired = clientVersion
    ? compareSemver(clientVersion, minVersion) < 0
    : false

  return {
    latestVersion,
    minVersion,
    storeUrl,
    updateRequired,
  }
}

export function assertExtensionVersionAllowed(clientVersion: string | null | undefined) {
  if (!clientVersion?.trim()) {
    return {
      ok: false as const,
      status: 426,
      body: {
        error: 'Extension update required',
        code: 'EXTENSION_VERSION_MISSING',
        message: 'Please update the CRMPG extension to continue syncing.',
      },
    }
  }

  const info = getExtensionVersionInfo(clientVersion)
  if (info.updateRequired) {
    return {
      ok: false as const,
      status: 426,
      body: {
        error: 'Extension update required',
        code: 'EXTENSION_OUTDATED',
        message: `Please update to v${info.minVersion} or newer to continue syncing.`,
        latestVersion: info.latestVersion,
        minVersion: info.minVersion,
        storeUrl: info.storeUrl,
      },
    }
  }

  return { ok: true as const, info }
}
