import type { ComponentProps } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { FOCUS_RING, cn } from '@/lib/cn'

type LinkHref = ComponentProps<typeof Link>['href']

/**
 * Link-based, like `Tabs` — the target page is fully determined by the URL,
 * so no client JavaScript is needed to move between pages.
 *
 * Shared by both catalogs (ruling 7, Task 17: "both catalogues identical"):
 * `hrefForPage` is the one thing that differs between them — the asset
 * catalog builds it from `AssetFilters` and `/listings`, the buyer catalog
 * from `BuyerFilters`, `/buyers`, and its own `forAsset` scoring parameter —
 * so this component itself stays filter-shape-agnostic rather than each
 * catalog carrying a near-duplicate pagination component.
 */
export function Pagination({
  page,
  totalPages,
  hrefForPage,
  className,
}: {
  page: number
  totalPages: number
  hrefForPage: (targetPage: number) => LinkHref
  className?: string
}) {
  const t = useTranslations('assets')
  if (totalPages <= 1) return null

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
