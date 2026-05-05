import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

export type PaymentReceiptInput = {
  orderNumber: string
  amount: number
  currency: string
  paidAt: string
  packageName: string | null
  receiptLine: string | null
  exchangeReferenceNumber: string | null
  transactionId: string | null
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currency || 'MYR' }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48

/** pdf-lib embeds fonts — no filesystem AFM files (works with Next.js / serverless). */
export async function renderGoogleAdsPaymentReceiptPdf(data: PaymentReceiptInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const courier = await pdfDoc.embedFont(StandardFonts.Courier)

  const page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const center = (text: string, size: number, font: PDFFont, color = rgb(0.067, 0.094, 0.153)) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (PAGE_W - w) / 2, y: y - size, size, font, color })
    y -= size + 10
  }

  const left = (text: string, size: number, font: PDFFont, color = rgb(0.067, 0.094, 0.153)) => {
    page.drawText(text, { x: MARGIN, y: y - size, size, font, color })
    y -= size + 8
  }

  center('Payment receipt', 20, bold)
  center('Google Ads subscription (CRM)', 10, regular, rgb(0.42, 0.45, 0.5))
  y -= 12

  left('Invoice / order number', 11, bold)
  left(data.orderNumber, 11, courier)

  left('Date', 11, bold)
  left(
    new Date(data.paidAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }),
    11,
    regular
  )

  left('Description', 11, bold)
  left(data.packageName || 'Google Ads package', 11, regular)

  left('Amount paid', 11, bold)
  left(fmtMoney(data.amount, data.currency), 14, bold, rgb(0.02, 0.53, 0.41))
  y -= 8

  const metaColor = rgb(0.22, 0.25, 0.32)
  const metaSize = 10
  if (data.exchangeReferenceNumber) {
    left(`Bank / FPX reference: ${data.exchangeReferenceNumber}`, metaSize, regular, metaColor)
  }
  if (data.transactionId) {
    left(`Transaction ID: ${data.transactionId}`, metaSize, regular, metaColor)
  }
  if (data.receiptLine) {
    left(`Receipt: ${data.receiptLine}`, metaSize, regular, metaColor)
  }

  y -= 16
  const footer = 'This document confirms payment recorded in your account. Retain for your records.'
  const footerFont = regular
  const footerSize = 9
  const footerW = footerFont.widthOfTextAtSize(footer, footerSize)
  page.drawText(footer, {
    x: (PAGE_W - footerW) / 2,
    y: MARGIN,
    size: footerSize,
    font: footerFont,
    color: rgb(0.61, 0.64, 0.69),
  })

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}
