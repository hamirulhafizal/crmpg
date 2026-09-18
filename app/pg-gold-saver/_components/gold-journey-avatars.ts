/**
 * Hardcoded avatars of customers who completed the Gold Journey checklist.
 * Swap these URLs with real WhatsApp / stored avatar URLs anytime — no API call on login.
 */
export const GOLD_JOURNEY_COMPLETE_AVATARS = [
  {
    id: 'gj-1',
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-amber-200',
  },
  {
    id: 'gj-2',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-rose-200',
  },
  {
    id: 'gj-3',
    url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-teal-200',
  },
  {
    id: 'gj-4',
    url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-orange-200',
  },
  {
    id: 'gj-5',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-pink-200',
  },
  {
    id: 'gj-6',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-yellow-200',
  },
  {
    id: 'gj-7',
    url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-amber-100',
  },
  {
    id: 'gj-8',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&h=160&q=80',
    tint: 'bg-rose-100',
  },
] as const

export type GoldJourneyAvatar = (typeof GOLD_JOURNEY_COMPLETE_AVATARS)[number]
