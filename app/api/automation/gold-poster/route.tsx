import { ImageResponse } from 'next/og'
import { fetchPublicGoldBuybackSnapshot } from '@/app/lib/public-gold-prices'

export const runtime = 'nodejs'

export async function GET() {
  const data = await fetchPublicGoldBuybackSnapshot()
  const dt = new Date(data.fetchedAtIso)
  const when = dt.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg,#0b1220,#111827)',
          color: '#f8fafc',
          padding: 56,
          fontFamily: 'Inter, Arial',
        }}
      >
        <div style={{ fontSize: 34, opacity: 0.9 }}>Public Gold Buyback Update</div>
        <div style={{ fontSize: 62, fontWeight: 700, marginTop: 14 }}>Harga Buyback Hari Ini</div>
        <div style={{ fontSize: 26, marginTop: 8, opacity: 0.8 }}>{`Updated: ${when} (MYT)`}</div>

        <div
          style={{
            marginTop: 40,
            borderRadius: 24,
            border: '2px solid #334155',
            background: '#0f172a',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <Row label="PG Jewel 999" value={data.pgJewel999Buy} />
          <Row label="PG Jewel 916" value={data.pgJewel916Buy} />
          <Row label="Non-PG 999" value={data.nonPg999Buy} />
          <Row label="Non-PG 916" value={data.nonPg916Buy} />
        </div>

        <div style={{ marginTop: 'auto', fontSize: 22, opacity: 0.7 }}>
          Source: publicgold.com.my
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 4px',
        borderBottom: '1px solid #334155',
        fontSize: 34,
      }}
    >
      <div>{label}</div>
      <div style={{ fontWeight: 700 }}>{`RM ${value} / g`}</div>
    </div>
  )
}

