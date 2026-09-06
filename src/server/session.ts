import { redirect } from '@/i18n/navigation'
import { auth } from '@/auth'
import { toAppLocale } from '@/i18n/locale'
import { viewerGate, type Viewer } from '@/lib/authz'

/**
 * The session is a JWT, so `status` is a snapshot from sign-in time.
 * Re-reading it here means a manager's suspension takes effect on the
 * suspended user's very next request rather than at their next sign-in.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const { prisma } = await import('@/server/db')
  // `select` rather than `include`: this runs on every render across the
  // whole app, so it names only the fields `Viewer` actually needs — no
  // reason to pull `passwordHash` off the wire on every page load.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      buyerProfile: { select: { id: true } },
      sellerProfile: { select: { id: true } },
    },
  })
  if (!user || user.status === 'REMOVED') return null

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    buyerProfileId: user.buyerProfile?.id ?? null,
    sellerProfileId: user.sellerProfile?.id ?? null,
  }
}

/** The locale-agnostic targets anything in this app redirects a viewer to. */
export type RedirectHref = '/login' | '/suspended' | '/admin'

/**
 * `redirect()`'s declared return type is `never` — it always throws — but
 * that type does not survive far enough through `createNavigation`'s generics
 * for `tsc` to treat a bare call to it as unreachable, so `viewer` below would
 * stay typed `Viewer | null` after the guard clauses. This wrapper's own
 * explicit `never` annotation fixes the narrowing without changing behaviour.
 *
 * Exported since Task 18: `/dashboard` sends a manager to `/admin` and then
 * dispatches on the viewer's profile rows, so without this wrapper `tsc`
 * would consider both dispatch branches reachable for a manager and the only
 * thing keeping them out would be the runtime `NEXT_REDIRECT` throw. A guard
 * that the type system cannot see is one stray `try`/`catch` away from
 * silently failing, and this file already owns the fix.
 *
 * It is also where a caller-supplied locale is validated, rather than at each
 * call site. `requireViewer` below is called by every Server Action in the app
 * with the `locale` field of that action's own client-supplied input, and an
 * unauthenticated call redirects — so before this check, `locale:
 * "/evil.example.com"` produced the protocol-relative `//evil.example.com/login`.
 * `toAppLocale` (`@/i18n/locale`) substitutes `routing.defaultLocale` for
 * anything that is not a configured locale; the reasoning, and why it
 * substitutes rather than throws, is written up there.
 *
 * This is NOT the only funnel, and an earlier version of this comment claimed
 * it was. `signInAction`/`signOutAction` (`@/server/actions/auth`) call
 * next-intl's `redirect()` and `getPathname()` directly, never reaching this
 * wrapper, and were missed by exactly the reasoning that sentence encouraged —
 * they had to be fixed separately, one commit later. They now call
 * `toAppLocale` themselves. Anything added that builds a locale-prefixed URL
 * without coming through here must do the same; centralising the rule here
 * removes six chances to forget it, not the seventh.
 */
export function redirectNow(href: RedirectHref, locale: string): never {
  redirect({ href, locale: toAppLocale(locale) })
  throw new Error('unreachable: redirect() always throws')
}

export async function requireViewer(locale: string): Promise<Viewer> {
  const viewer = await getViewer()
  switch (viewerGate(viewer)) {
    case 'REQUIRE_LOGIN':
      return redirectNow('/login', locale)
    case 'SUSPENDED':
      return redirectNow('/suspended', locale)
  }
  // Only reachable when `viewerGate` returned `'ALLOW'`, which by definition
  // means `viewer` is non-null and `ACTIVE` — both other branches above
  // return through `redirectNow`, which never returns.
  return viewer as Viewer
}
