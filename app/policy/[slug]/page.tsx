import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SitePublicChrome } from '@/app/components/SitePublicChrome'
import { POLICY_CATALOG, getPolicyMeta, isPolicySlug } from '@/app/lib/policy/catalog'
import { loadPolicy } from '@/app/lib/policy/load-policy'
import { PolicyDocument } from '@/app/policy/_components/PolicyDocument'
import { PolicyNav } from '@/app/policy/_components/PolicyNav'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return POLICY_CATALOG.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const meta = getPolicyMeta(slug)
  if (!meta) return { title: 'Policy' }
  return {
    title: `${meta.title} | RAKAN AUTOMASI MARKETING`,
    description: meta.description,
    alternates: {
      canonical: `https://publicgolds.com/policy/${meta.slug}`,
    },
  }
}

export default async function PolicySlugPage({ params }: PageProps) {
  const { slug } = await params
  if (!isPolicySlug(slug)) notFound()

  const policy = await loadPolicy(slug)

  return (
    <SitePublicChrome activePath="/policy" showPolicyLinks>
      <div className="grid gap-6 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Policies
          </p>
          <PolicyNav activeSlug={slug} />
        </aside>

        <PolicyDocument
          title={policy.meta.title}
          description={policy.meta.description}
          blocks={policy.blocks}
        />
      </div>
    </SitePublicChrome>
  )
}
