import { redirect } from 'next/navigation'

export default async function CampaignDetailRedirectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  redirect(`/dashboard/campaigns?view=${encodeURIComponent(id)}`)
}
