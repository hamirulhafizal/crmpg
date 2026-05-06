import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchPublicGoldBuybackSnapshot } from '@/app/lib/public-gold-prices'

export const runtime = 'nodejs'

export async function GET() {
  const data = await fetchPublicGoldBuybackSnapshot()
  const dt = new Date(data.fetchedAtIso)
  const dateLabel = dt
    .toLocaleDateString('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase()
  const timeLabel = dt.toLocaleTimeString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toUpperCase()
  const templatePath = join(process.cwd(), 'public', 'templatebuyback.png')
  const templateBuffer = await readFile(templatePath)
  const templateDataUrl = `data:image/png;base64,${templateBuffer.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 819,
          height: 1024,
          display: 'flex',
          position: 'relative',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <img
          src={templateDataUrl}
          alt="Template"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 129,
            top: 532,
            width: 562,
            height: 196,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            color: '#ffffff',
            textShadow: '0 2px 6px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 1.6, lineHeight: 1 }}>{dateLabel}</div>
          <div
            style={{
              marginTop: 12,
              width: 562,
              height: 112,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 56,
              background: 'rgba(50, 9, 9, 0.55)',
              border: '2px solid rgba(255, 255, 255, 0.18)',
              boxShadow: 'inset 0 8px 30px rgba(255,255,255,0.08), 0 8px 18px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                width: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              <div style={{ fontSize: 62, fontWeight: 900, color: '#ffde42' }}>{`RM${data.pgJewel999Buy}/g`}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>(999/24 karat)</div>
            </div>
            <div
              style={{
                width: 2,
                height: 74,
                background: 'rgba(255, 214, 79, 0.9)',
                borderRadius: 2,
              }}
            />
            <div
              style={{
                width: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              <div style={{ fontSize: 62, fontWeight: 900, color: '#ffde42' }}>{`RM${data.pgJewel916Buy}/g`}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>(916/22 karat)</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{`Update : ${timeLabel}`}</div>
        </div>
      </div>
    ),
    { width: 819, height: 1024 }
  )
}

