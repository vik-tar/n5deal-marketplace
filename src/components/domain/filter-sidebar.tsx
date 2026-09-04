'use client'

import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import {
  ASSET_CATEGORIES,
  BUSINESS_STATUSES,
  assetFiltersToSearchParams,
  type AssetFilters,
} from '@/lib/filters/asset-filters'
import { toCountryCodes } from '@/lib/filters/shared'
import { parseEuros } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { CategoryFacet } from '@/server/queries/assets'

const LISTINGS_PATH = '/listings' as const

/** True when any of the actual filter facets (not sort, not page) is set. */
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

const checkboxClass = cn(
  'h-4 w-4 shrink-0 rounded border-border bg-surface-2 accent-accent',
  FOCUS_RING,
)

/**
 * Client component: every control here navigates via `useRouter()`, rebuilding
 * the query string from the current `filters` plus one changed field and
 * resetting `page` to 1 — the URL is the only state. Category and business
 * status checkboxes apply immediately; the country and price fields apply
 * together on submit, since typing a country code or a price digit-by-digit
 * should not navigate on every keystroke.
 */
export function FilterSidebar({
  filters,
  facets,
}: {
  filters: AssetFilters
  facets: CategoryFacet[]
}) {
  const t = useTranslations('assets')
  const router = useRouter()

  function navigate(patch: Partial<AssetFilters>) {
    const next: AssetFilters = { ...filters, ...patch, page: 1 }
    const query = Object.fromEntries(assetFiltersToSearchParams(next))
    router.push({ pathname: LISTINGS_PATH, query })
  }

  function toggleCategory(category: AssetFilters['categories'][number]) {
    const isActive = filters.categories.includes(category)
    navigate({
      categories: isActive
        ? filters.categories.filter((c) => c !== category)
        : [...filters.categories, category],
    })
  }

  function toggleBusinessStatus(status: AssetFilters['businessStatuses'][number]) {
    const isActive = filters.businessStatuses.includes(status)
    navigate({
      businessStatuses: isActive
        ? filters.businessStatuses.filter((s) => s !== status)
        : [...filters.businessStatuses, status],
    })
  }

  function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    navigate({
      countries: toCountryCodes(String(data.get('countries') ?? '')),
      priceMinCents: parseEuros(String(data.get('priceMin') ?? '').trim()),
      priceMaxCents: parseEuros(String(data.get('priceMax') ?? '').trim()),
    })
  }

  const facetCount = new Map(facets.map((facet) => [facet.category, facet.count]))
  // Forces the uncontrolled country/price inputs to reset their displayed
  // value whenever those fields change from elsewhere (smart search, a
  // filter chip, browser back/forward) rather than from this form's own submit.
  const formKey = `${filters.countries.join(',')}|${filters.priceMinCents ?? ''}|${filters.priceMaxCents ?? ''}`

  return (
    <aside className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{t('filters.title')}</h2>
        {hasActiveFilters(filters) ? (
          <Link
            href={LISTINGS_PATH}
            className={cn(
              'rounded-sm text-xs font-medium text-accent transition hover:opacity-80',
              FOCUS_RING,
            )}
          >
            {t('filters.clearAll')}
          </Link>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="meta-label mb-1">{t('filters.categoryLabel')}</legend>
        {ASSET_CATEGORIES.map((category) => (
          <label key={category} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={filters.categories.includes(category)}
              onChange={() => toggleCategory(category)}
              className={checkboxClass}
            />
            <span className="flex-1">{t(`category.${category}`)}</span>
            <span className="text-xs text-ink-muted">{facetCount.get(category) ?? 0}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="meta-label mb-1">{t('filters.businessStatusLabel')}</legend>
        {BUSINESS_STATUSES.map((status) => (
          <label key={status} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={filters.businessStatuses.includes(status)}
              onChange={() => toggleBusinessStatus(status)}
              className={checkboxClass}
            />
            <span>{t(`businessStatus.${status}`)}</span>
          </label>
        ))}
      </fieldset>

      <form key={formKey} onSubmit={handleApply} className="flex flex-col gap-4">
        <Field label={t('filters.countryLabel')} htmlFor="countries">
          <input
            id="countries"
            name="countries"
            type="text"
            defaultValue={filters.countries.join(', ')}
            placeholder={t('filters.countryPlaceholder')}
            className="field-control"
          />
        </Field>

        <Field label={t('filters.priceLabel')} htmlFor="priceMin">
          <div className="flex items-center gap-2">
            <input
              id="priceMin"
              name="priceMin"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={filters.priceMinCents !== null ? filters.priceMinCents / 100 : ''}
              placeholder={t('filters.priceMinPlaceholder')}
              aria-label={t('filters.priceMinPlaceholder')}
              className="field-control"
            />
            <span aria-hidden="true" className="text-ink-muted">
              &ndash;
            </span>
            <input
              name="priceMax"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={filters.priceMaxCents !== null ? filters.priceMaxCents / 100 : ''}
              placeholder={t('filters.priceMaxPlaceholder')}
              aria-label={t('filters.priceMaxPlaceholder')}
              className="field-control"
            />
          </div>
        </Field>

        <Button type="submit" variant="secondary" size="sm">
          {t('filters.apply')}
        </Button>
      </form>
    </aside>
  )
}
