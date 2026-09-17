'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/contexts/auth-context'
import { getCachedWhatsAppAvatarUrl } from '@/app/lib/customers/avatar-url-cache'
import { fetchCustomerAvatarUrl } from '@/app/lib/customers/fetch-customers'
import { customerKeys } from '@/app/lib/customers/query-keys'
import { isValidCampaignPhone } from '@/app/lib/phone-msisdn'

type Props = {
  customerId: string
  phone: string | null | undefined
  displayName: string | null | undefined
}

function initialsFromName(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function CustomerWhatsAppAvatar({ customerId, phone, displayName }: Props) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const canFetch = Boolean(userId && customerId && isValidCampaignPhone(phone))
  const cachedUrl = userId ? getCachedWhatsAppAvatarUrl(userId, customerId) : undefined

  useEffect(() => {
    setImgFailed(false)
  }, [customerId, cachedUrl])

  useEffect(() => {
    const el = rootRef.current
    if (!el || !canFetch) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '120px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [canFetch, customerId])

  const avatarQuery = useQuery({
    queryKey: customerKeys.avatar(userId, customerId),
    queryFn: () => fetchCustomerAvatarUrl(customerId, userId),
    enabled: Boolean(userId && visible && canFetch),
    initialData: cachedUrl === undefined ? undefined : cachedUrl,
    staleTime: 24 * 60 * 60_000,
    gcTime: 48 * 60 * 60_000,
    retry: false,
  })

  const url = !imgFailed ? (avatarQuery.data ?? null) : null
  const initials = initialsFromName(displayName)

  return (
    <span
      ref={rootRef}
      className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
      {avatarQuery.isFetching && !url ? (
        <span className="absolute inset-0 animate-pulse rounded-full bg-slate-300/40" />
      ) : null}
    </span>
  )
}
