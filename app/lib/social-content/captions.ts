import OpenAI from 'openai'

import {
  DEALER_FOOTER,
  type ContentCategory,
  type ContentCategoryId,
} from '@/app/lib/social-content/categories'

type HookBank = Record<ContentCategoryId, string[]>

const NEGATIVE_HOOKS: HookBank = {
  jual_emas: [
    'Masih simpan duit dalam akaun je… tapi nilai dia makin kecik setiap tahun?',
    'Takut harga emas naik, tapi takut juga nak mula?',
    'Setiap bulan gaji masuk — setiap bulan juga habis tanpa jejak?',
  ],
  buyback: [
    'Ada emas, tapi tak tahu macam mana nak cairkan dengan harga berbaloi?',
    'Takut digapai harga buyback yang tak adil?',
    'Emas ada, tapi terasa macamlah “terperangkap” sebab tak tahu jenama apa yang diterima?',
  ],
  barang_emas: [
    'Beli barang emas sebab “comel” je… lepas tu rugi bila nak jual balik?',
    'Takut pilih 916 yang nampak cantik tapi nilai jangka panjang lemah?',
    'Masih keliru antara emas pakai dan emas simpanan?',
  ],
  topup_gap: [
    'Nak mula simpan emas, tapi rasa kena ada beribu-ribu dulu?',
    'Tunggu “bila dah kaya” baru nak topup — sampai bila?',
    'Takut mula kecil, takut juga terlepas peluang?',
  ],
  pemudah_cara: [
    'Bosan tengok orang lain advance dalam emas, diri sendiri masih standing by?',
    'Ada minat… tapi tiada orang guide step by step?',
    'Takut tersalah langkah sebab buat seorang diri?',
  ],
}

const TWISTS: HookBank = {
  jual_emas: [
    'Plot twist: emas 999, goldbar, dinar & perak boleh jadi aset yang nampak — bukan cuma nombor dalam bank.',
    'Plot twist: satu langkah kecil hari ini boleh jadi perlindungan nilai untuk tahun hadapan.',
    'Plot twist: bukan “kaya dulu baru beli emas” — ramai mula kecil, konsisten, kemudian nampak beza.',
  ],
  buyback: [
    'Plot twist: buyback emas 999/916 boleh jelas bila anda faham jenis & jenama yang diterima.',
    'Plot twist: cairkan emas dengan yakin bila prosesnya transparent — bukan teka-teki.',
    'Plot twist: tahu jenama & ketulenan = kuasa rundingan yang lebih tenang.',
  ],
  barang_emas: [
    'Plot twist: barang emas 999/916 boleh cantik DAN ada nilai — kalau dipilih dengan niat yang betul.',
    'Plot twist: bukan semua “kilat” sama nilai. Pilih yang sepadan dengan tujuan anda.',
    'Plot twist: faham 999 vs 916 = kurang menyesal kemudian hari.',
  ],
  topup_gap: [
    'Plot twist: akaun GAP boleh bermula dari RM100 — kecil, tapi arahnya jelas.',
    'Plot twist: disiplin kecil berulang lebih kuat dari “tunggu seribu ratus”.',
    'Plot twist: RM100 hari ini adalah bukti anda dah mula — bukan lagi plan dalam kepala.',
  ],
  pemudah_cara: [
    'Plot twist: anda tak perlu jalan sunyi. Ada pemudah cara & pembimbing yang ready guide.',
    'Plot twist: step by step dengan mentor buat perjalanan emas lebih tenang dan terarah.',
    'Plot twist: guidance yang betul jimat masa, jimat salah langkah, tambah keyakinan.',
  ],
}

function pick<T>(arr: T[], salt: number): T {
  return arr[Math.abs(salt) % arr.length]!
}

function mediaHint(mediaTitle?: string | null, mediaCaption?: string | null): string {
  const raw = [mediaTitle, mediaCaption].filter(Boolean).join(' — ').trim()
  if (!raw) return 'lihat visual ni'
  return raw.slice(0, 120)
}

/** Deterministic BM template (negative hook → twist → media tie-in → CTA). */
export function buildTemplateCaption(input: {
  category: ContentCategory
  mediaTitle?: string | null
  mediaCaption?: string | null
  salt?: number
}): string {
  const salt = input.salt ?? Date.now()
  const hook = pick(NEGATIVE_HOOKS[input.category.id], salt)
  const twist = pick(TWISTS[input.category.id], salt + 17)
  const hint = mediaHint(input.mediaTitle, input.mediaCaption)

  const body = [
    hook,
    '',
    twist,
    '',
    `Tengok media ni: ${hint}.`,
    'Kalau hati dah berdesir — itu sign anda ready ubah arah.',
    '',
    'Jom engage: komen “SAYA READY” atau DM untuk guide seterusnya.',
    DEALER_FOOTER,
  ]

  return body.join('\n')
}

function createOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

/** Hybrid: template structure + LLM rewrite in 100% BM, tied to media. */
export async function generateHybridCaption(input: {
  category: ContentCategory
  mediaTitle?: string | null
  mediaCaption?: string | null
  mediaType?: string | null
  salt?: number
}): Promise<{ caption: string; source: 'hybrid' | 'template' }> {
  const template = buildTemplateCaption(input)

  const openai = createOpenAIClient()
  if (!openai) return { caption: template, source: 'template' }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_SOCIAL_CAPTION?.trim() || 'gpt-4o-mini',
      temperature: 0.85,
      max_tokens: 450,
      messages: [
        {
          role: 'system',
          content: `Anda copywriter sosial media Bahasa Melayu (100% BM, tiada English kecuali nama produk).
Tulis caption pendek-sederhana untuk Instagram/TikTok.
WAJIB struktur:
1) Hook negatif (sakit/keraguan audience)
2) Plot twist positif (ubah hidup / peluang emas)
3) Kaitkan dengan media yang diberi (jangan ignore visual/caption media)
4) CTA engagemen (komen/DM)
5) Tutup EXACT dengan footer dealer ini tanpa ubah:
${DEALER_FOOTER}

Elak emoji berlebihan. Elak hashtag English. Nada motivate + engaging. Jangan tipu claim.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            kategori: input.category.label,
            fokusangan_kategori: input.category.description,
            jenis_media: input.mediaType || 'unknown',
            tajuk_media: input.mediaTitle || null,
            caption_asal_media: input.mediaCaption || null,
            rujukan_template: template,
          }),
        },
      ],
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return { caption: template, source: 'template' }

    const caption = text.includes('PG00104897') ? text : `${text.trim()}\n${DEALER_FOOTER}`
    return { caption, source: 'hybrid' }
  } catch {
    return { caption: template, source: 'template' }
  }
}
