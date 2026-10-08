import type { Metadata } from 'next'
import Link from 'next/link'
import { SitePublicChrome } from '@/app/components/SitePublicChrome'
import { COMPANY } from '@/app/lib/company'

export const metadata: Metadata = {
  title: `Contact us | ${COMPANY.name}`,
  description: `Contact ${COMPANY.name} for support, orders, privacy requests, and general enquiries.`,
  alternates: {
    canonical: 'https://publicgolds.com/contact',
  },
}

const CONTACT_ROWS = [
  { label: 'Merchant', value: `${COMPANY.name} (trading as ${COMPANY.tradingAs})` },
  { label: 'Registration No.', value: COMPANY.registrationNumber },
  { label: 'Address', value: COMPANY.address },
  { label: 'Website', value: COMPANY.website, href: COMPANY.website },
  { label: 'Support email', value: COMPANY.supportEmail, href: `mailto:${COMPANY.supportEmail}` },
] as const

export default function ContactPage() {
  return (
    <SitePublicChrome activePath="/contact" showPolicyLinks>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Contact us
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Reach {COMPANY.name} for orders, CRM support, privacy requests, and general enquiries.
            </p>
          </header>

          <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              We are the seller of record and your primary contact for Website purchases and{' '}
              {COMPANY.productName}. Please contact us first for delivery, refunds, disputes, or
              personal-data requests before involving the payment processor or your bank.
            </p>

            <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {CONTACT_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-1 bg-card px-4 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-sm text-foreground sm:text-[15px]">
                    {'href' in row && row.href ? (
                      <a
                        href={row.href}
                        className="font-medium text-sky-600 underline decoration-sky-600/30 underline-offset-2 hover:decoration-sky-600 dark:text-sky-400"
                        {...(row.href.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                      >
                        {row.value}
                      </a>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">What to include</h2>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Your full name and the email used at signup or checkout</li>
                <li>Order reference or account email (for CRM / subscription issues)</li>
                <li>A clear description of your request, with screenshots where helpful</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Policies</h2>
              <p>
                Before writing in, you may find answers in our{' '}
                <Link
                  href="/policy/terms"
                  className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400"
                >
                  Terms &amp; Conditions
                </Link>
                ,{' '}
                <Link
                  href="/policy/privacy"
                  className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400"
                >
                  Privacy Policy
                </Link>
                , or{' '}
                <Link
                  href="/policy/refund"
                  className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400"
                >
                  Refund &amp; Cancellation Policy
                </Link>
                .
              </p>
            </section>
          </div>
        </article>

        <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Quick actions</h2>
          <div className="mt-4 space-y-2">
            <a
              href={`mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent('Support enquiry')}`}
              className="flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Email support
            </a>
            <Link
              href="/about"
              className="flex w-full items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              About us
            </Link>
            <Link
              href="/login"
              className="flex w-full items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Sign in to CRM
            </Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            We aim to respond to support email during Malaysian business hours. Complex order or AML
            verification requests may take longer.
          </p>
        </aside>
      </div>
    </SitePublicChrome>
  )
}
