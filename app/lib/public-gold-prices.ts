export type GoldPriceSnapshot = {
  fetchedAtIso: string
  pgJewel999Buy: string
  pgJewel916Buy: string
  nonPg999Buy: string
  nonPg916Buy: string
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractTableByTitle(html: string, title: string): string | null {
  const titleIdx = html.toLowerCase().indexOf(title.toLowerCase())
  if (titleIdx < 0) return null
  const afterTitle = html.slice(titleIdx, titleIdx + 40000)
  const tableMatch = afterTitle.match(/<table[\s\S]*?<\/table>/i)
  return tableMatch ? tableMatch[0] : null
}

function extractRowValue(tableHtml: string, rowLabel: string, valueCellIndex: number): string | null {
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi
  const rows = tableHtml.match(rowRegex) || []

  for (const row of rows) {
    if (!new RegExp(`\\b${rowLabel}\\b`, 'i').test(stripTags(row))) continue
    const tdRegex = /<td[\s\S]*?<\/td>/gi
    const cells = row.match(tdRegex) || []
    if (cells.length === 0) continue

    const values = cells.map((cell) => {
      const txt = stripTags(cell)
      const m = txt.match(/[0-9][0-9,\.]*/)
      return m ? m[0].replace(/,/g, '') : ''
    })
    const picked = values[valueCellIndex]
    if (picked) return picked
  }
  return null
}

export async function fetchPublicGoldBuybackSnapshot(): Promise<GoldPriceSnapshot> {
  const res = await fetch('https://publicgold.com.my/', {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 CRMPG Gold Poster Bot' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Public Gold fetch failed: ${res.status}`)
  const html = await res.text()

  const pgJewelTable = extractTableByTitle(html, 'PG Jewel')
  const nonPgTable = extractTableByTitle(html, 'Non-PG Gold Buyback')

  const pgJewel999Buy = pgJewelTable ? extractRowValue(pgJewelTable, '999', 2) : null
  const pgJewel916Buy = pgJewelTable ? extractRowValue(pgJewelTable, '916', 2) : null
  const nonPg999Buy = nonPgTable ? extractRowValue(nonPgTable, '999', 1) : null
  const nonPg916Buy = nonPgTable ? extractRowValue(nonPgTable, '916', 1) : null

  if (!pgJewel999Buy || !pgJewel916Buy || !nonPg999Buy || !nonPg916Buy) {
    throw new Error('Unable to parse buyback prices from publicgold.com.my')
  }

  return {
    fetchedAtIso: new Date().toISOString(),
    pgJewel999Buy,
    pgJewel916Buy,
    nonPg999Buy,
    nonPg916Buy,
  }
}

