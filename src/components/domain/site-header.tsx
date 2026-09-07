import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { LocaleSwitcher } from '@/components/domain/locale-switcher'
import { NAV_HREF, SIGN_IN_HREF, navKeysFor } from '@/lib/nav'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { Viewer } from '@/lib/authz'
import { signOutAction } from '@/server/actions/auth'

export function SiteHeader({ viewer, locale }: { viewer: Viewer | null; locale: string }) {
  const t = useTranslations()
  // A suspended viewer keeps a session — they can still see their email and
  // sign out below — but `statusAllowsAuthenticatedSurfaces`
  // (`@/lib/authz/rules.ts`) already says a non-ACTIVE viewer may not reach
  // an authenticated surface, so the nav should offer exactly what an
  // anonymous visitor is offered. The public pages stay open to them; the
  // dashboard, the inbox and the profile do not. That is expressed here, by
  // passing `null` and no profiles, rather than by teaching `navKeysFor` about
  // `status`: account status is this component's business, key visibility is
  // that function's.
  //
  // Task 18 added the two role-specific entry points (`/listings/new`,
  // `/profile`), which depend on whether the viewer holds the matching
  // profile row and not only on their role. Only the two booleans travel into
  // `navKeysFor`, never the cuids themselves, and both are dropped along with
  // the role for a non-ACTIVE viewer.
  const isActiveViewer = viewer !== null && viewer.status === 'ACTIVE'
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

        {/* The negative margins give the scroll container enough padding for a
            child's focus ring — `overflow-x-auto` clips at the padding box. */}
        <nav
          aria-label={t('header.primaryNav')}
          className="-mx-1 -my-2 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-2"
        >
          {navKeys.map((key) => (
            <Link
              key={key}
              href={NAV_HREF[key]}
              className={cn(
                'rounded-sm px-2 py-1 text-sm whitespace-nowrap text-ink-muted transition hover:text-ink',
                FOCUS_RING,
              )}
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

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
