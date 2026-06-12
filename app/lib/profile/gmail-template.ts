/** Default Gmail fallback body — dealer name & phone are baked in; {SenderName} is filled per customer at send time. */
export function buildDefaultGmailMessage(dealerName: string, dealerPhone: string): string {
  const name = dealerName.trim() || 'Dealer Public Gold'
  const phone = dealerPhone.replace(/\D/g, '') || '60123456789'
  return [
    'Assalamualikum dan Salam',
    '',
    'Ini {SenderName} ya ?',
    `saya ${name} Dealer Public Gold`,
    '',
    '{SenderName} sudah tukar no whatsapp ya ?',
    '',
    'Sila click link di bawah untuk hubungi saya',
    '',
    `wasap.my/${phone}/INFO_EMAS`,
    `wasap.my/${phone}/INFO_EMAS`,
    `wasap.my/${phone}/INFO_EMAS`,
  ].join('\n')
}
