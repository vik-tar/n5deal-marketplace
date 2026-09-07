import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { BuyerFilterSidebar } from '@/components/domain/buyer-filter-sidebar'
import { BuyerAssetSelector, type ScorableAsset } from '@/components/domain/buyer-asset-selector'
import { BuyerSearch } from '@/components/domain/buyer-search'
import { BuyerCard } from '@/components/domain/buyer-card'
import { Pagination } from '@/components/domain/pagination'
import { listBuyers } from '@/server/queries/buyers'
import { requireViewer } from '@/server/session'
import { prisma } from '@/server/db'
import { canBrowseBuyers } from '@/lib/authz'
import { isAiEnabled } from '@/lib/ai/client'
import { formatCents } from '@/lib/money'
import { codeToFlag } from '@/lib/geo/flag'
import { FOCUS_RING, cn } from '@/lib/cn'
import { PAGE_SIZE, type RawSearchParams } from '@/lib/filters/shared'
import type { Translator } from '@/i18n/translator'
import {
  buyerFiltersToSearchParams,
  hasActiveBuyerFilters,
  parseBuyerFilters,
  parseForAssetId,
  type BuyerFilters,
} from '@/lib/filters/buyer-filters'

/**
 * The seller's half of the marketplace: browse, filter and search
 * buyer mandates, optionally scored against one of the seller's own
 * published listings.
 *
 * Gated exactly like every other role-specific page in this app —
 * `requireViewer` first, then the page's own predicate, then `notFound()` —
 * which is what `/admin`, `/dashboard`, `/profile` and `/listings/new` all do.
 * This page used to be the single exception: it called `getViewer()` and
 * rendered an empty directory with an explanatory panel to anyone who may not
 * browse it. Two things were wrong with that.
 *
 * The first was a false statement. The subtitle below renders `total` from the
 * query, and `listBuyers` answers `{ items: [], total: 0 }` for a viewer it
 * refuses — so an anonymous visitor was told "0 investor mandates" about a
 * marketplace holding twelve. A page that cannot show you the data must not
 * make claims about how much of it there is.
 *
 * The second was that the three refusals are not one refusal. `requireViewer`
 * splits them where the viewer can act on the difference: an anonymous visitor
 * goes to `/login`, where signing in is the thing to do; a suspended seller
 * goes to `/suspended`, which tells them why and what it does not stop them
 * doing; a signed-in buyer gets the 404 they would get from `/admin`, because
 * the directory is not theirs to see and never will be. A bare `notFound()`
 * would collapse all three into a dead end, and the empty panel collapsed them
 * into a lie.
 *
 * `listBuyers` keeps its own `canBrowseBuyers` refusal. That is defence in
 * depth, not duplication: the query is what guarantees no buyer row reaches a
 * caller who may not have it, whatever any page in front of it does.
 */
export default async function BuyersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { locale } = await params
  const rawSearchParams = await searchParams
  const filters = parseBuyerFilters(rawSearchParams)
  const requestedAssetId = parseForAssetId(rawSearchParams)

  const viewer = await requireViewer(locale)
  if (!canBrowseBuyers(viewer)) notFound()

  const [t, tProfile, tAssets] = await Promise.all([
    getTranslations('buyers'),
    getTranslations('profile'),
    getTranslations('assets'),
  ])

  const [{ items, total, scoredAssetId }, scorableAssets] = await Promise.all([
    listBuyers(filters, viewer, requestedAssetId),
    viewer.sellerProfileId
      ? prisma.asset.findMany({
          where: { sellerProfileId: viewer.sellerProfileId, status: 'PUBLISHED' },
          select: { id: true, publicRef: true, teaserTitle: true },
          orderBy: { publishedAt: 'desc' },
        })
      : Promise.resolve<ScorableAsset[]>([]),
  ])

  const aiEnabled = isAiEnabled()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle', { count: total })}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <BuyerFilterSidebar filters={filters} forAssetId={scoredAssetId} />

          <div className="min-w-0">
            <BuyerSearch filters={filters} forAssetId={scoredAssetId} />

            {viewer.sellerProfileId ? (
              <div className="mt-4">
                <BuyerAssetSelector
                  assets={scorableAssets}
                  filters={filters}
                  forAssetId={scoredAssetId}
                />
              </div>
            ) : null}

            <FilterChips
              filters={filters}
              locale={locale}
              t={t}
              tProfile={tProfile}
              tAssets={tAssets}
              forAssetId={scoredAssetId}
            />

            {items.length === 0 ? (
              <EmptyState t={t} hasFilters={hasActiveBuyerFilters(filters)} />
            ) : (
              <>
                <ul className="mt-4 flex flex-col gap-4">
                  {items.map((buyer) => (
                    <li key={buyer.id}>
                      <BuyerCard
                        buyer={buyer}
                        locale={locale}
                        aiEnabled={aiEnabled}
                        forAssetId={scoredAssetId}
                      />
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={filters.page}
                  totalPages={totalPages}
                  hrefForPage={(targetPage) => ({
                    pathname: '/buyers',
                    query: {
                      ...Object.fromEntries(
                        buyerFiltersToSearchParams({ ...filters, page: targetPage }),
                      ),
                      ...(scoredAssetId ? { forAsset: scoredAssetId } : {}),
                    },
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
 * Every non-default filter rendered as a removable chip, mirroring
 * `listings/page.tsx`'s identical `FilterChips` ("both catalogues
 * identical"). `forAssetId`, when set, is preserved on every chip's own link
 * — removing a filter must not also silently stop scoring against the
 * selected listing.
 */
function FilterChips({
  filters,
  locale,
  t,
  tProfile,
  tAssets,
  forAssetId,
}: {
  filters: BuyerFilters
  locale: string
  t: Translator
  tProfile: Translator
  tAssets: Translator
  forAssetId: string | null
}) {
  const chips: Array<{ key: string; label: string; patch: Partial<BuyerFilters> }> = []

  if (filters.q !== '') {
    chips.push({ key: 'q', label: t('chips.search', { value: filters.q }), patch: { q: '' } })
  }
  for (const buyerType of filters.buyerTypes) {
    chips.push({
      key: `buyerType-${buyerType}`,
      label: tProfile(`buyerType.${buyerType}`),
      patch: { buyerTypes: filters.buyerTypes.filter((b) => b !== buyerType) },
    })
  }
  for (const category of filters.categories) {
    chips.push({
      key: `category-${category}`,
      label: tAssets(`category.${category}`),
      patch: { categories: filters.categories.filter((c) => c !== category) },
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
  if (filters.ticketMinCents !== null) {
    chips.push({
      key: 'ticketMin',
      label: t('chips.ticketMin', { value: formatCents(filters.ticketMinCents, locale) }),
      patch: { ticketMinCents: null },
    })
  }

  if (chips.length === 0) return null

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label={t('chips.ariaLabel')}>
      {chips.map((chip) => {
        const query = {
          ...Object.fromEntries(buyerFiltersToSearchParams({ ...filters, ...chip.patch, page: 1 })),
          ...(forAssetId ? { forAsset: forAssetId } : {}),
        }
        return (
          <li key={chip.key}>
            <Link
              href={{ pathname: '/buyers', query }}
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

/**
 * The one empty state left: a seller whose filters happen to exclude every
 * buyer. "You may not browse this directory" is no longer an empty state — it
 * is a redirect or a 404, decided above before any query runs.
 */
function EmptyState({
  t,
  hasFilters,
}: {
  t: Translator
  hasFilters?: boolean
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-16 text-center">
      <p className="text-lg font-semibold text-ink">{t('empty.noResults.title')}</p>
      <p className="max-w-sm text-sm text-ink-muted">{t('empty.noResults.body')}</p>
      {hasFilters ? (
        <Link
          href="/buyers"
          className={cn(
            'mt-2 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition hover:opacity-90',
            FOCUS_RING,
          )}
        >
          {t('empty.noResults.clearAction')}
        </Link>
      ) : null}
    </div>
  )
}
