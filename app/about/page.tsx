import type { Metadata } from 'next'
import Link from 'next/link'
import { SitePublicChrome } from '@/app/components/SitePublicChrome'
import { COMPANY } from '@/app/lib/company'

export const metadata: Metadata = {
  title: `About us | ${COMPANY.name}`,
  description: `Learn about ${COMPANY.name} and Public Gold CRM on publicgolds.com.`,
  alternates: {
    canonical: 'https://publicgolds.com/about',
  },
}

export default function AboutPage() {
  return (
    <SitePublicChrome activePath="/about" showPolicyLinks>
      <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">About us</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Who we are and what we build for Public Gold dealers.
          </p>
        </header>

        <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our company</h2>
            <p>
              <strong className="text-foreground">{COMPANY.name}</strong> (Registration No.{' '}
              {COMPANY.registrationNumber}) operates{' '}
              <a
                href={COMPANY.website}
                className="font-medium text-sky-600 underline decoration-sky-600/30 underline-offset-2 hover:decoration-sky-600 dark:text-sky-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                {COMPANY.websiteLabel}
              </a>
              . We provide digital commerce and dealer tools that help authorised Public Gold
              partners run customer relationships, messaging, and related workflows with clarity and
              care.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">What we offer</h2>
            <p>
              <strong className="text-foreground">{COMPANY.productName}</strong> is our dealer-facing
              platform for managing customers, WhatsApp messaging, automations, billing, and campaign
              workflows. Alongside the CRM, we also operate digital-goods sales on the Website —
              including vouchers, e-codes, licences and top-ups — with instant electronic delivery.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">How we work</h2>
            <p>
              We are the seller of record for purchases made on our Website. Payments are processed
              by an independent payment gateway; questions about orders, delivery, refunds, or your
              personal data should come to us first. Our practices are set out in our published{' '}
              <Link href="/policy/terms" className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400">
                policies
              </Link>
              , including privacy, refunds, acceptable use, and AML controls.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Where we are</h2>
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-foreground/90">
              {COMPANY.address}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Get in touch</h2>
            <p>
              For support or partnership enquiries, visit our{' '}
              <Link
                href="/contact"
                className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400"
              >
                Contact us
              </Link>{' '}
              page or email{' '}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="font-medium text-sky-600 underline underline-offset-2 dark:text-sky-400"
              >
                {COMPANY.supportEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </SitePublicChrome>
  )
}
