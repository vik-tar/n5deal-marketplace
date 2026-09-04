'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { assetFiltersToSearchParams, type AssetFilters } from '@/lib/filters/asset-filters'
import { parseSearchQueryAction } from '@/server/actions/search'
import { Button } from '@/components/ui/button'

const LISTINGS_PATH = '/listings' as const

/**
 * Plain search always works: it just sets `q` and navigates. The AI button
 * only renders when `aiEnabled` — passed down from the server component,
 * since `isAiEnabled()` reads `process.env` and cannot run in a client
 * component. On a successful parse the returned patch is merged into the
 * current filters and the browser navigates; on a `null` result (no key, a
 * refusal, a parsing failure) this falls back to a plain `q` search on the
 * raw text — the AI path never leaves the user with no result at all.
 */
export function SmartSearch({
  filters,
  aiEnabled,
}: {
  filters: AssetFilters
  aiEnabled: boolean
}) {
  const t = useTranslations('assets')
  const locale = useLocale()
  const router = useRouter()
  const [value, setValue] = useState(filters.q)
  const [isPending, startTransition] = useTransition()

  function navigate(patch: Partial<AssetFilters>) {
    const next: AssetFilters = { ...filters, ...patch, page: 1 }
    const query = Object.fromEntries(assetFiltersToSearchParams(next))
    router.push({ pathname: LISTINGS_PATH, query })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate({ q: value.trim() })
  }

  function handleAskAi() {
    const query = value.trim()
    if (query === '') return
    startTransition(async () => {
      const patch = await parseSearchQueryAction(query, locale)
      navigate(patch ?? { q: query })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <label htmlFor="asset-search" className="sr-only">
        {t('searchPlaceholder')}
      </label>
      <input
        id="asset-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('searchPlaceholder')}
        className="field-control min-w-48 flex-1"
      />
      <Button type="submit" variant="secondary" size="sm">
        {t('searchSubmit')}
      </Button>
      {aiEnabled ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending || value.trim() === ''}
          onClick={handleAskAi}
        >
          {isPending ? t('searchAiPending') : t('searchAiButton')}
        </Button>
      ) : null}
    </form>
  )
}
