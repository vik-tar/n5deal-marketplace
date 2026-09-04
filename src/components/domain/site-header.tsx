import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { LocaleSwitcher } from '@/components/domain/locale-switcher'
import { NAV_HREF, SIGN_IN_HREF, navKeysFor } from '@/lib/nav'
import { cn } from '@/lib/cn'

/**
 * Temporary stand-in for `Viewer` (Task 6), which Task 11 substitutes here
 * along with the real session and the sign-out action.
 */
export type HeaderViewer = {
  role: string
  email: string
}

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function SiteHeader({ viewer }: { viewer: HeaderViewer | null }) {
  const t = useTranslations()
  const navKeys = navKeysFor(viewer?.role ?? null)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-ground/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className={cn(
            'shrink-0 rounded-sm text-base font-semibold tracking-tight text-ink',
            focusRing,
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
                focusRing,
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
              {/* Task 11 wraps this in the sign-out Server Action form. */}
              <Button type="button" variant="ghost" size="sm">
                {t('common.signOut')}
              </Button>
            </>
          ) : (
            <Link
              href={SIGN_IN_HREF}
              className={cn(
                'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:opacity-90',
                focusRing,
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
