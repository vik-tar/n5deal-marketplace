import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { LocaleSwitcher } from '@/components/domain/locale-switcher'
import { SiteNav } from '@/components/domain/site-nav'
import { SIGN_IN_HREF, navKeysFor } from '@/lib/nav'
import { FOCUS_RING, cn } from '@/lib/cn'
import { isActive, type Viewer } from '@/lib/authz'
import { signOutAction } from '@/server/actions/auth'

export function SiteHeader({
  viewer,
  locale,
  unreadCount,
}: {
  viewer: Viewer | null
  locale: string
  /** Messages waiting for this viewer; `0` for anonymous, suspended and managers. */
  unreadCount: number
}) {
  const t = useTranslations()
  // A suspended viewer keeps a session — they can still see their email and
  // sign out below — but a non-ACTIVE viewer may not reach an authenticated
  // surface (`statusAllowsAuthenticatedSurfaces`, `@/lib/authz`, which
  // `viewerGate` enforces for every page that requires a viewer), so the nav
  // should offer exactly what an anonymous visitor is offered. The public
  // pages stay open to them; the dashboard, the inbox and the profile do not.
  // That is expressed here, by passing `null` and no profiles, rather than by
  // teaching `navKeysFor` about `status`: account status is this component's
  // business, key visibility is that function's.
  //
  // The predicate below is `isActive`, not `statusAllowsAuthenticatedSurfaces`
  // — the two answer different questions and only one of them is this one.
  // That one returns `true` for an anonymous `null` by design (nothing about
  // their *status* bars them; being signed out does, under another rule), and
  // a header that treated `null` as admissible would render a dashboard link
  // for a signed-out visitor. `isActive` is "signed in and ACTIVE", which is
  // exactly the condition these three lines need, and it was previously
  // written out inline here rather than called.
  //
  // The two role-specific entry points (`/listings/new`, `/profile`) depend
  // on whether the viewer holds the matching profile row and not only on
  // their role. Only the two booleans travel into
  // `navKeysFor`, never the cuids themselves, and both are dropped along with
  // the role for a non-ACTIVE viewer.
  const isActiveViewer = isActive(viewer)
  const navKeys = navKeysFor(
    isActiveViewer ? viewer.role : null,
    isActiveViewer
      ? { buyer: viewer.buyerProfileId !== null, seller: viewer.sellerProfileId !== null }
      : { buyer: false, seller: false },
  )
  const boundSignOut = signOutAction.bind(null, locale)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-ground/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className={cn(
            'shrink-0 rounded-sm text-base font-semibold tracking-tight text-ink',
            FOCUS_RING,
          )}
        >
          {t('common.appName')}
        </Link>

        {/* The nav itself is a client component: the current page is not
            readable from a server component in this Next.js version, and a
            value read once here would go stale the moment the router moved
            between two pages sharing this layout. `SiteNav` explains both
            halves. Everything crossing the boundary is already-translated
            text plus the key set this component decided above. */}
        {/* The badge rides on the key set decided above rather than on a
            separate condition, so a viewer who is not offered an inbox cannot
            be given a count for one — a manager and a suspended viewer are
            already excluded by `navKeysFor`, and `countUnreadMessages`
            independently answers them `0`. Two rules that agree, neither
            relying on the other. */}
        <SiteNav
          ariaLabel={t('header.primaryNav')}
          discardPrompt={t('header.discardPrompt')}
          items={navKeys.map((key) => ({
            key,
            label: t(`nav.${key}`),
            ...(key === 'inbox' && unreadCount > 0
              ? { badgeCount: unreadCount, badgeLabel: t('nav.unread', { count: unreadCount }) }
              : {}),
          }))}
        />

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* Both of the switcher's hooks read request-time URL data. */}
          <Suspense fallback={<div className="h-7 w-19" aria-hidden="true" />}>
            <LocaleSwitcher />
          </Suspense>

          {viewer ? (
            <>
              <span className="hidden text-sm text-ink-muted sm:inline">
                {viewer.email}
              </span>
              <form action={boundSignOut}>
                <Button type="submit" variant="ghost" size="sm">
                  {t('common.signOut')}
                </Button>
              </form>
            </>
          ) : (
            <Link
              href={SIGN_IN_HREF}
              className={cn(
                'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:opacity-90',
                FOCUS_RING,
              )}
            >
              {t('common.signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
