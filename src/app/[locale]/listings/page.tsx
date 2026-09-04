import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Tabs } from '@/components/ui/tabs'
import { FilterSidebar } from '@/components/domain/filter-sidebar'
import { SmartSearch } from '@/components/domain/smart-search'
import { AssetCard } from '@/components/domain/asset-card'
import { Pagination } from '@/components/domain/pagination'
import { listAssets } from '@/server/queries/assets'
import { getViewer } from '@/server/session'
import { isAiEnabled } from '@/lib/ai/client'
import { codeToFlag } from '@/lib/geo/flag'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'
import { PAGE_SIZE, type RawSearchParams } from '@/lib/filters/shared'
import {
  ASSET_SORTS,
  assetFiltersToSearchParams,
  parseAssetFilters,
  type AssetFilters,
} from '@/lib/filters/asset-filters'

/**
 * Loose on purpose: this app does not augment next-intl's `Messages` type, so
 * every `t()` call across the codebase already takes a plain string key. This
 * alias just gives the two render helpers below a name for "the `assets`
 * namespace translator `getTranslations('assets')` resolves to".
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

/** Same "is any real filter set" check `FilterSidebar` uses, for the empty state. */
function hasActiveFilters(filters: AssetFilters): boolean {
  return (
    filters.q !== '' ||
    filters.categories.length > 0 ||
    filters.countries.length > 0 ||
    filters.businessStatuses.length > 0 ||
    filters.priceMinCents !== null ||
    filters.priceMaxCents !== null
  )
}

export default async function ListingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { locale } = await params
  const rawSearchParams = await searchParams
  const filters = parseAssetFilters(rawSearchParams)

  const [viewer, t] = await Promise.all([getViewer(), getTranslations('assets')])
  const { items, total, facets } = await listAssets(filters, viewer)

  const aiEnabled = isAiEnabled()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const sortItems = ASSET_SORTS.map((sort) => ({
    id: sort,
    label: t(`sort.${sort}`),
    href: {
      pathname: '/listings' as const,
      query: Object.fromEntries(assetFiltersToSearchParams({ ...filters, sort, page: 1 })),
    },
  }))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle', { count: total })}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <FilterSidebar filters={filters} facets={facets} />

        <div className="min-w-0">
          <SmartSearch filters={filters} aiEnabled={aiEnabled} />

          <FilterChips filters={filters} locale={locale} t={t} />

          <div className="mt-4">
            <Tabs items={sortItems} activeId={filters.sort} ariaLabel={t('sort.ariaLabel')} />
          </div>

          {items.length === 0 ? (
            <EmptyState t={t} hasFilters={hasActiveFilters(filters)} />
          ) : (
            <>
              <ul className="mt-4 flex flex-col gap-4">
                {items.map((asset) => (
                  <li key={asset.id}>
                    <AssetCard asset={asset} locale={locale} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={filters.page}
                totalPages={totalPages}
                hrefForPage={(targetPage) => ({
                  pathname: '/listings',
                  query: Object.fromEntries(
                    assetFiltersToSearchParams({ ...filters, page: targetPage }),
                  ),
                })}
                className="mt-6"
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

/**
 * Every non-default filter — however it got set: the sidebar, the smart
 * search box, the AI parse, or a hand-edited URL — rendered as a removable
 * chip. This is what makes an AI-derived filter set legible: the model
 * proposes, and this row is where the user can see and correct it.
 */
function FilterChips({
  filters,
  locale,
  t,
}: {
  filters: AssetFilters
  locale: string
  t: Translator
}) {
  const chips: Array<{ key: string; label: string; patch: Partial<AssetFilters> }> = []

  if (filters.q !== '') {
    chips.push({ key: 'q', label: t('chips.search', { value: filters.q }), patch: { q: '' } })
  }
  for (const category of filters.categories) {
    chips.push({
      key: `category-${category}`,
      label: t(`category.${category}`),
      patch: { categories: filters.categories.filter((c) => c !== category) },
    })
  }
  for (const status of filters.businessStatuses) {
    chips.push({
      key: `status-${status}`,
      label: t(`businessStatus.${status}`),
      patch: { businessStatuses: filters.businessStatuses.filter((s) => s !== status) },
    })
  }
  for (const country of filters.countries) {
    const flag = codeToFlag(country)
    chips.push({
      key: `country-${country}`,
      label: flag ? `${flag} ${country}` : country,
      patch: { countries: filters.countries.filter((c) => c !== country) },
    })
  }
  if (filters.priceMinCents !== null) {
    chips.push({
      key: 'priceMin',
      label: t('chips.priceFrom', { value: formatCents(filters.priceMinCents, locale) }),
      patch: { priceMinCents: null },
    })
  }
  if (filters.priceMaxCents !== null) {
    chips.push({
      key: 'priceMax',
      label: t('chips.priceTo', { value: formatCents(filters.priceMaxCents, locale) }),
      patch: { priceMaxCents: null },
    })
  }

  if (chips.length === 0) return null

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label={t('chips.ariaLabel')}>
      {chips.map((chip) => {
        const query = Object.fromEntries(
          assetFiltersToSearchParams({ ...filters, ...chip.patch, page: 1 }),
        )
        return (
          <li key={chip.key}>
            <Link
              href={{ pathname: '/listings', query }}
              aria-label={t('chips.remove', { value: chip.label })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-ink transition hover:border-accent/60',
                FOCUS_RING,
              )}
            >
              <span>{chip.label}</span>
              <span aria-hidden="true" className="text-ink-muted">
                &times;
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function EmptyState({ t, hasFilters }: { t: Translator; hasFilters: boolean }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-16 text-center">
      <p className="text-lg font-semibold text-ink">{t('empty.title')}</p>
      <p className="max-w-sm text-sm text-ink-muted">{t('empty.body')}</p>
      {hasFilters ? (
        <Link
          href="/listings"
          className={cn(
            'mt-2 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition hover:opacity-90',
            FOCUS_RING,
          )}
        >
          {t('empty.clearAction')}
        </Link>
      ) : null}
    </div>
  )
}
