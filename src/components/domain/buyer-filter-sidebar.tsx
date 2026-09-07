'use client'

import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { ASSET_CATEGORIES } from '@/lib/filters/asset-filters'
import {
  BUYER_TYPES,
  buyerFiltersToSearchParams,
  hasActiveBuyerFilters,
  type BuyerFilters,
} from '@/lib/filters/buyer-filters'
import { toCountryCodes } from '@/lib/filters/shared'
import { parseEuros } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FOCUS_RING, cn } from '@/lib/cn'

const BUYERS_PATH = '/buyers' as const

const checkboxClass = cn(
  'h-4 w-4 shrink-0 rounded border-border bg-surface-2 accent-accent',
  FOCUS_RING,
)

/**
 * The buyer catalog's own `FilterSidebar` (`@/components/domain/filter-sidebar`),
 * kept as a separate component rather than a shared generic one because the
 * two catalogs filter genuinely different shapes (`BuyerFilters` maps onto a
 * mandate, `AssetFilters` onto a listing) — but built to the identical
 * pattern: a client component whose every control
 * navigates via `useRouter()`, rebuilding the query string from the current
 * `filters` plus one changed field and resetting `page` to 1.
 *
 * `forAssetId` — the "score against…" listing, if one is selected — is not
 * part of `BuyerFilters` (it is a scoring parameter, not a filter the query
 * shape maps onto), so every navigation here re-appends it manually to keep
 * a scored view scored while the seller narrows the list down.
 */
export function BuyerFilterSidebar({
  filters,
  forAssetId,
}: {
  filters: BuyerFilters
  forAssetId: string | null
}) {
  const t = useTranslations('buyers')
  const tProfile = useTranslations('profile')
  const tAssets = useTranslations('assets')
  const router = useRouter()

  function navigate(patch: Partial<BuyerFilters>) {
    const next: BuyerFilters = { ...filters, ...patch, page: 1 }
    const query = Object.fromEntries(buyerFiltersToSearchParams(next))
    if (forAssetId) query.forAsset = forAssetId
    router.push({ pathname: BUYERS_PATH, query })
  }

  function toggleBuyerType(buyerType: BuyerFilters['buyerTypes'][number]) {
    const isActive = filters.buyerTypes.includes(buyerType)
    navigate({
      buyerTypes: isActive
        ? filters.buyerTypes.filter((b) => b !== buyerType)
        : [...filters.buyerTypes, buyerType],
    })
  }

  function toggleCategory(category: BuyerFilters['categories'][number]) {
    const isActive = filters.categories.includes(category)
    navigate({
      categories: isActive
        ? filters.categories.filter((c) => c !== category)
        : [...filters.categories, category],
    })
  }

  function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    navigate({
      countries: toCountryCodes(String(data.get('countries') ?? '')),
      ticketMinCents: parseEuros(String(data.get('ticketMin') ?? '').trim()),
    })
  }

  const clearHref = forAssetId
    ? { pathname: BUYERS_PATH, query: { forAsset: forAssetId } }
    : BUYERS_PATH

  // Forces the uncontrolled country/ticket inputs to reset their displayed
  // value whenever those fields change from elsewhere (a filter chip,
  // browser back/forward) rather than from this form's own submit.
  const formKey = `${filters.countries.join(',')}|${filters.ticketMinCents ?? ''}`

  return (
    <aside className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{t('filters.title')}</h2>
        {hasActiveBuyerFilters(filters) ? (
          <Link
            href={clearHref}
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
        <legend className="meta-label mb-1">{t('filters.buyerTypeLabel')}</legend>
        {BUYER_TYPES.map((buyerType) => (
          <label key={buyerType} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={filters.buyerTypes.includes(buyerType)}
              onChange={() => toggleBuyerType(buyerType)}
              className={checkboxClass}
            />
            <span className="flex-1">{tProfile(`buyerType.${buyerType}`)}</span>
          </label>
        ))}
      </fieldset>

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
            <span className="flex-1">{tAssets(`category.${category}`)}</span>
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

        <Field label={t('filters.ticketMinLabel')} htmlFor="ticketMin">
          <input
            id="ticketMin"
            name="ticketMin"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={filters.ticketMinCents !== null ? filters.ticketMinCents / 100 : ''}
            placeholder={t('filters.ticketMinPlaceholder')}
            className="field-control"
          />
        </Field>

        <Button type="submit" variant="secondary" size="sm">
          {t('filters.apply')}
        </Button>
      </form>
    </aside>
  )
}
