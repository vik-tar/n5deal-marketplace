import type { AssetStatus, Role, UserStatus } from '@/generated/prisma/client'
import { keepKnown, toList, type RawSearchParams } from './shared'

/**
 * The manager console's URL state — which tab is open and how each tab's
 * table is filtered — parsed and serialised exactly as `asset-filters.ts` and
 * `buyer-filters.ts` already do for the two catalogs, and sharing the same
 * `./shared` primitives.
 *
 * The console keeps *all* of it in the URL, not just the active tab's own
 * filters: switching to Listings and back must not silently drop the
 * participant filters a manager set on the way in, and a filtered admin view
 * is meant to be pasteable into a message ("the three suspended sellers I
 * mean are here"). That is also why the tab itself is a query parameter
 * rather than three routes — `Tabs` (`@/components/ui/tabs`) is link-based
 * and works with client JavaScript disabled, and one route means one place
 * where the filter state is parsed.
 *
 * There is no `page` here and no `PAGE_SIZE`: the console reads both tables
 * unpaginated. See `@/server/queries/admin-where` for why (the orders that
 * matter cannot be expressed as a Prisma `orderBy`, so they are applied in
 * memory, and an in-memory sort of a paginated read would drop rows).
 */

export const ADMIN_TABS = ['participants', 'assets', 'log'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export const ADMIN_ROLES = ['BUYER', 'SELLER', 'MANAGER'] as const satisfies readonly Role[]

export const ADMIN_USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'REMOVED',
] as const satisfies readonly UserStatus[]

/**
 * Every `AssetStatus` the listings tab may be filtered to — the whole enum,
 * because the console is the one surface with no visibility floor at all.
 *
 * Deliberately not reusing `SELLER_STATUS_ORDER` (`@/server/queries/asset-where`),
 * which happens to contain the same six members: that constant is the *order*
 * a seller's own dashboard renders its sections in, and reusing it here would
 * tie the admin filter's allowlist to a presentation decision made for a
 * different page. `satisfies` keeps both exhaustive independently.
 */
export const ADMIN_ASSET_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
  'SOLD',
] as const satisfies readonly AssetStatus[]

export interface AdminFilters {
  tab: AdminTab
  /** Participants tab: role checkboxes. Empty means "every role". */
  roles: Role[]
  /** Participants tab: account-status checkboxes. Empty means "every status". */
  userStatuses: UserStatus[]
  /** Participants tab: free text over email and display name. */
  q: string
  /** Listings tab: status checkboxes. Empty means "every status". */
  assetStatuses: AssetStatus[]
}

const DEFAULT_TAB: AdminTab = 'participants'

export function parseAdminFilters(sp: RawSearchParams): AdminFilters {
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q

  return {
    tab: (ADMIN_TABS as readonly string[]).includes(rawTab ?? '')
      ? (rawTab as AdminTab)
      : DEFAULT_TAB,
    roles: keepKnown(toList(sp.roles), ADMIN_ROLES),
    userStatuses: keepKnown(toList(sp.userStatuses), ADMIN_USER_STATUSES),
    // The same 200-character cap `parseAssetFilters` and `parseBuyerFilters`
    // put on their own free-text field: this string becomes a `contains`
    // clause, and nothing useful is searched for past that length.
    q: (rawQ ?? '').trim().slice(0, 200),
    assetStatuses: keepKnown(toList(sp.assetStatuses), ADMIN_ASSET_STATUSES),
  }
}

/**
 * The inverse of `parseAdminFilters`, for the links the console builds.
 *
 * The default tab is omitted rather than written out, so `/admin` and
 * `/admin?tab=participants` are the same URL rather than two — matching how
 * `assetFiltersToSearchParams` omits its default `sort` and page 1.
 */
export function adminFiltersToSearchParams(filters: Partial<AdminFilters>): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.tab && filters.tab !== DEFAULT_TAB) sp.set('tab', filters.tab)
  if (filters.roles?.length) sp.set('roles', filters.roles.join(','))
  if (filters.userStatuses?.length) sp.set('userStatuses', filters.userStatuses.join(','))
  if (filters.q) sp.set('q', filters.q)
  if (filters.assetStatuses?.length) sp.set('assetStatuses', filters.assetStatuses.join(','))
  return sp
}
