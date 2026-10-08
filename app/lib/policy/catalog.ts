export type PolicySlug =
  | 'terms'
  | 'refund'
  | 'acceptable-use'
  | 'privacy'
  | 'cookies'
  | 'returns'
  | 'aml'

export type PolicyMeta = {
  slug: PolicySlug
  title: string
  /** Marker line at the start of this section in public/policy/content.txt */
  marker: RegExp
  description: string
}

export const POLICY_CATALOG: readonly PolicyMeta[] = [
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    marker: /^T&C\s*$/m,
    description: 'Terms governing use of the Website and purchase of digital goods.',
  },
  {
    slug: 'refund',
    title: 'Refund & Cancellation Policy',
    marker: /^2\.\s*refund\s*$/im,
    description: 'How cancellations and refunds are handled for digital goods.',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    marker: /^3\.\s*Acceptable Use Policy\s*$/m,
    description: 'Permitted and prohibited activities when using our Service.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    marker: /^4\.\s*Privacy policy\s*$/im,
    description: 'How we collect, use, and protect your personal data under the PDPA.',
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    marker: /^5\.\s*cookies policy\s*$/im,
    description: 'How we use cookies and similar technologies on the Website.',
  },
  {
    slug: 'returns',
    title: 'Returns Policy',
    marker: /^6\.\s*return policy\s*$/im,
    description: 'When a return or refund may be available for digital goods.',
  },
  {
    slug: 'aml',
    title: 'AML Policy',
    marker: /^7\.\s*AML policy\s*$/im,
    description: 'Anti-money laundering and counter-terrorism financing controls.',
  },
] as const

export function isPolicySlug(value: string): value is PolicySlug {
  return POLICY_CATALOG.some((p) => p.slug === value)
}

export function getPolicyMeta(slug: string): PolicyMeta | null {
  return POLICY_CATALOG.find((p) => p.slug === slug) ?? null
}
