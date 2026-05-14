import { redirect } from 'next/navigation'

export default async function CampaignEditRedirectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  redirect(`/dashboard/campaigns?edit=${encodeURIComponent(id)}`)
}
