export type ContentCategoryId =
  | 'jual_emas'
  | 'buyback'
  | 'barang_emas'
  | 'topup_gap'
  | 'pemudah_cara'

export type ContentCategory = {
  id: ContentCategoryId
  label: string
  description: string
  /** Telegram / R2 search queries (tried in order). */
  mediaQueries: string[]
  r2Keywords: string[]
  preferVideo: boolean
}

export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    id: 'jual_emas',
    label: 'Jual Emas 999 / Goldbar / Dinar / Perak',
    description: 'Jual emas 999, goldbar, dinar dan perak',
    mediaQueries: ['#goldbar', '#1Dinar', '#5gram', 'dinar', 'goldbar', 'perak'],
    r2Keywords: ['goldbar', 'dinar', 'emas', 'perak', '999', 'gram'],
    preferVideo: true,
  },
  {
    id: 'buyback',
    label: 'Buyback Emas 999/916',
    description: 'Buyback emas 999/916 dan jenis jenama',
    mediaQueries: ['buyback', '916', '999', 'jenama', 'Kredit'],
    r2Keywords: ['buyback', '916', '999', 'jenama', 'kredit'],
    preferVideo: true,
  },
  {
    id: 'barang_emas',
    label: 'Barang Emas 999/916',
    description: 'Barang kemas emas 999/916',
    mediaQueries: ['barang emas', '916', 'rantai', 'gelang', 'cincin'],
    r2Keywords: ['barang', '916', 'rantai', 'gelang', 'cincin', 'kemas'],
    preferVideo: false,
  },
  {
    id: 'topup_gap',
    label: 'Topup GAP dari RM100',
    description: 'Topup akaun GAP bermula RM100',
    mediaQueries: ['GAP', 'topup', 'RM100', 'akaun'],
    r2Keywords: ['gap', 'topup', 'rm100', 'akaun'],
    preferVideo: false,
  },
  {
    id: 'pemudah_cara',
    label: 'Pemudah Cara / Pembimbing',
    description: 'Dealer Public Gold PG00104897 sebagai pemudah cara',
    mediaQueries: ['Dealer', 'Public Gold', 'PG', 'Kredit', 'event'],
    r2Keywords: ['dealer', 'public', 'gold', 'pg', 'event', 'kredit'],
    preferVideo: true,
  },
]

/** 7-day rotation for first test week. */
export const SEVEN_DAY_CATEGORY_ROTATION: ContentCategoryId[] = [
  'jual_emas',
  'buyback',
  'barang_emas',
  'topup_gap',
  'pemudah_cara',
  'jual_emas',
  'buyback',
]

export function getCategory(id: string): ContentCategory | undefined {
  return CONTENT_CATEGORIES.find((c) => c.id === id)
}

export const DEALER_FOOTER = `—
Saya Pemudah Cara / Pembimbing
Dealer Public Gold PG00104897`

export const MEDIA_COOLDOWN_DAYS = 30
export const DEFAULT_GENERATE_DAYS = 7
export const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur'

/** Peak posting hours in MY (24h). */
export const PEAK_HOURS_MY = [12, 20, 21] as const
