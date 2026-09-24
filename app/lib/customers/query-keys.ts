export type CustomerListQueryParams = {
  page: number
  limit: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  search: string
  gender: string
  ethnicity: string
  ageMin: number
  ageMax: number
  ageFilterMin: number
  ageFilterMax: number
  birthday: string
  accountStatus: string
  profileVerified: string
  directDebit: string
  acquisitionSource: string
  registerMonth: string
  lastPurchaseMonth: string
  tagIds: string[]
  viewMode: 'paginated' | 'all'
  /** Phone / WhatsApp reachability: valid | invalid | changed | passed_away */
  phoneContactStatus?: string
  /** When `dealers`, only Rank containing dealer (not plain customer). */
  businessRank?: '' | 'dealers'
  totalFrontline?: string
  empireSize?: string
}

export const customerKeys = {
  all: (userId: string) => ['customers', userId] as const,
  lists: (userId: string) => [...customerKeys.all(userId), 'list'] as const,
  list: (userId: string, params: CustomerListQueryParams) =>
    [...customerKeys.lists(userId), params] as const,
  stats: (userId: string) => [...customerKeys.all(userId), 'stats'] as const,
  salesJourney: (userId: string) => [...customerKeys.all(userId), 'salesJourney'] as const,
  team: (userId: string) => [...customerKeys.all(userId), 'team'] as const,
  teamList: (userId: string, params: CustomerListQueryParams) =>
    [...customerKeys.team(userId), params] as const,
  detail: (userId: string, customerId: string) =>
    [...customerKeys.all(userId), 'detail', customerId] as const,
  avatar: (userId: string, customerId: string) =>
    [...customerKeys.all(userId), 'avatar', customerId] as const,
}
