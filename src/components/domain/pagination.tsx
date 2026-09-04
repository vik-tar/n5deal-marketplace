import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { assetFiltersToSearchParams, type AssetFilters } from '@/lib/filters/asset-filters'
import { FOCUS_RING, cn } from '@/lib/cn'

/**
 * Link-based, like `Tabs` — the target page is fully determined by the URL,
 * so no client JavaScript is needed to move between pages.
 */
export function Pagination({
  filters,
  totalPages,
  className,
}: {
  filters: AssetFilters
  totalPages: number
  className?: string
}) {
  const t = useTranslations('assets')
  if (totalPages <= 1) return null

  const { page } = filters

  function hrefForPage(targetPage: number) {
    const query = Object.fromEntries(
      assetFiltersToSearchParams({ ...filters, page: targetPage }),
    )
    return { pathname: '/listings' as const, query }
  }

  const linkClass = cn(
    'rounded-sm text-sm font-medium text-ink transition hover:text-accent',
    FOCUS_RING,
  )
  const disabledClass = 'text-sm text-ink-muted opacity-50'

  return (
    <nav
      aria-label={t('pagination.ariaLabel')}
      className={cn('flex items-center justify-between gap-4', className)}
    >
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} className={linkClass}>
          {t('pagination.previous')}
        </Link>
      ) : (
        <span className={disabledClass}>{t('pagination.previous')}</span>
      )}

      <p className="text-sm text-ink-muted">
        {t('pagination.status', { page, total: totalPages })}
      </p>

      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)} className={linkClass}>
          {t('pagination.next')}
        </Link>
      ) : (
        <span className={disabledClass}>{t('pagination.next')}</span>
      )}
    </nav>
  )
}
