'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { buyerFiltersToSearchParams, type BuyerFilters } from '@/lib/filters/buyer-filters'
import { Button } from '@/components/ui/button'

const BUYERS_PATH = '/buyers' as const

/**
 * Plain free-text search for the buyer catalog — the mirror of
 * `SmartSearch` (`@/components/domain/smart-search`) minus the AI
 * natural-language button: `explainMatch` is the only AI surface this
 * catalog needs (ruling 4, Task 17), and `parseSearchQuery`
 * (`@/lib/ai/search`) is shaped for `AssetFilters`, not `BuyerFilters` —
 * there is no natural-language parse to offer here, so this is deliberately
 * a plain form, not a scaled-down `SmartSearch`.
 *
 * Submitting always sets `q` and navigates, resetting `page` to 1 like every
 * other control on this page (ruling 7). `forAssetId`, when set, is
 * re-appended so a scored view stays scored while the seller searches
 * within it — the same pattern `BuyerFilterSidebar` and `BuyerAssetSelector`
 * already follow for the identical reason.
 */
export function BuyerSearch({
  filters,
  forAssetId,
}: {
  filters: BuyerFilters
  forAssetId: string | null
}) {
  const t = useTranslations('buyers')
  const router = useRouter()
  const [value, setValue] = useState(filters.q)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = Object.fromEntries(
      buyerFiltersToSearchParams({ ...filters, q: value.trim(), page: 1 }),
    )
    if (forAssetId) query.forAsset = forAssetId
    router.push({ pathname: BUYERS_PATH, query })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <label htmlFor="buyer-search" className="sr-only">
        {t('searchPlaceholder')}
      </label>
      <input
        id="buyer-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="field-control min-w-48 flex-1"
      />
      <Button type="submit" variant="secondary" size="sm">
        {t('searchSubmit')}
      </Button>
    </form>
  )
}
