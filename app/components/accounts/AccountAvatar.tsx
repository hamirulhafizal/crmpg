'use client'

import { accountInitials } from '@/app/lib/auth/saved-accounts'

type AccountAvatarProps = {
  avatarUrl: string | null
  fullName: string | null
  email: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs rounded-full',
  md: 'h-16 w-16 text-lg rounded-2xl',
  lg: 'h-20 w-20 text-xl rounded-2xl',
} as const

export function AccountAvatar({
  avatarUrl,
  fullName,
  email,
  size = 'md',
  className = '',
}: AccountAvatarProps) {
  const dim = sizeClasses[size]
  const initials = accountInitials(fullName, email)

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`${dim} shrink-0 object-cover ring-2 ring-white shadow-sm ${className}`}
      />
    )
  }

  return (
    <span
      className={`${dim} inline-flex shrink-0 items-center justify-center bg-violet-600 font-semibold text-white ring-2 ring-white shadow-sm ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  )
}
