'use client'

import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { buyerFiltersToSearchParams, type BuyerFilters } from '@/lib/filters/buyer-filters'
import { Field } from '@/components/ui/field'

const BUYERS_PATH = '/buyers' as const

/** One of the seller's own published listings, as offered by the "score against…" selector. */
export interface ScorableAsset {
  id: string
  publicRef: string
  teaserTitle: string
}

/**
 * "Score against…" (Step 3, Task 17): lets the viewing seller pick one of
 * their own published listings, setting `forAsset` in the URL so the whole
 * buyer grid re-renders scored and re-sorted — a plain navigation, not a
 * fetch, so the selection is shareable exactly like every other filter here
 * (ruling 7). Choosing the placeholder option clears `forAsset` and returns
 * to the unscored, newest-first view.
 *
 * Only ever rendered for a viewer with published listings to offer — the
 * page passes an empty `assets` array (renders the "no listings yet" notice
 * instead) for a manager, who has none.
 */
export function BuyerAssetSelector({
  assets,
  filters,
  forAssetId,
}: {
  assets: ScorableAsset[]
  filters: BuyerFilters
  forAssetId: string | null
}) {
  const t = useTranslations('buyers')
  const router = useRouter()

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    const query = Object.fromEntries(buyerFiltersToSearchParams({ ...filters, page: 1 }))
    if (value !== '') query.forAsset = value
    router.push({ pathname: BUYERS_PATH, query })
  }

  if (assets.length === 0) {
    return <p className="text-sm text-ink-muted">{t('scoreAgainst.empty')}</p>
  }

  return (
    <Field label={t('scoreAgainst.label')} htmlFor="score-against" className="sm:max-w-sm">
      <select
        id="score-against"
        value={forAssetId ?? ''}
        onChange={handleChange}
        className="field-control"
      >
        <option value="">{t('scoreAgainst.placeholder')}</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.publicRef} — {asset.teaserTitle}
          </option>
        ))}
      </select>
    </Field>
  )
}
