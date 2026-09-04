/**
 * Which primary navigation items a viewer may see, and where they point.
 *
 * Pure: no database, no fetch, no environment. Kept out of the header
 * component so the visibility rules can be unit-tested on their own.
 */

/** Keys into the `nav` message namespace. */
export type NavKey = 'listings' | 'buyers' | 'dashboard' | 'inbox' | 'admin'

/** Locale-agnostic targets; `Link` from `@/i18n/navigation` adds the prefix. */
export const NAV_HREF: Record<NavKey, string> = {
  listings: '/listings',
  buyers: '/buyers',
  dashboard: '/dashboard',
  inbox: '/inbox',
  admin: '/admin',
}

/** Where an anonymous visitor goes to sign in. */
export const SIGN_IN_HREF = '/login'

/**
 * `role` is the viewer's role, or `null` for an anonymous visitor. It is typed
 * as `string` rather than the Prisma `Role` so the header stays free of a
 * server-only import; `Role` is assignable to it.
 */
export function navKeysFor(role: string | null): NavKey[] {
  const keys: NavKey[] = ['listings']
  if (role === 'SELLER' || role === 'MANAGER') keys.push('buyers')
  if (role !== null) keys.push('dashboard', 'inbox')
  if (role === 'MANAGER') keys.push('admin')
  return keys
}
