'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { FOCUS_RING, cn } from '@/lib/cn'
import { hasUnsavedChanges } from '@/lib/unsaved-changes'

/**
 * Switches locale while staying on the current screen.
 *
 * `usePathname` from `@/i18n/navigation` returns the pathname *without* the
 * locale prefix, and the query string is re-attached verbatim (so repeated
 * params such as `?category=BANK&category=EMI` survive), which keeps a filtered
 * catalog view intact across the switch.
 *
 * Both hooks read request-time URL data, so the caller must render this inside
 * a `<Suspense>` boundary — `SiteHeader` does.
 */
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher')
  const activeLocale = useLocale()
  const pathname = usePathname()
  const queryString = useSearchParams().toString()
  const target = queryString ? `${pathname}?${queryString}` : pathname

  return (
    <nav
      aria-label={t('label')}
      className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5"
    >
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale
        return (
          <Link
            key={locale}
            href={target}
            locale={locale}
            aria-current={isActive ? 'true' : undefined}
            // Switching locale re-renders the page from the server, so an
            // unsaved form is lost exactly as it is by any other navigation.
            onNavigate={(event) => {
              if (hasUnsavedChanges() && !window.confirm(t('discardPrompt'))) event.preventDefault()
            }}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium transition',
              FOCUS_RING,
              isActive
                ? 'bg-accent text-accent-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <span aria-hidden="true">{locale.toUpperCase()}</span>
            <span className="sr-only">{t(`locale.${locale}`)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
