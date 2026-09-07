import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { AccessRequestQueue } from '@/components/domain/access-request-queue'
import { BuyerCard } from '@/components/domain/buyer-card'
import { StatusPill } from '@/components/domain/status-pill'
import { UnreadMessages } from '@/components/domain/buyer-dashboard'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { SellerListingGroup, SellerOverview, SellerRequestQueue } from '@/server/queries/assets'
import type { BuyerListItem } from '@/server/queries/buyers'

/**
 * The seller's half of `/dashboard`. Like `BuyerDashboard`, a server component
 * that fetches nothing: the page hands it `getSellerOverview`'s result plus
 * the buyers `listBuyers` scored against the seller's most recently published
 * listing.
 *
 * The approve/decline surface is `AccessRequestQueue`
 * (`@/components/domain/access-request-queue`) unchanged — the same client
 * component the listing detail page has used since Task 14, rendered once per
 * listing that has requests standing against it. Nothing about deciding a
 * request is reimplemented here; this page only decides which queues to show
 * and in what order.
 */
export function SellerDashboard({
  overview,
  matchedBuyers,
  matchedAsset,
  canCreateListing,
  locale,
  aiEnabled,
}: {
  overview: SellerOverview
  matchedBuyers: BuyerListItem[]
  /** The listing `matchedBuyers` was scored against, or `null` if nothing is published. */
  matchedAsset: { id: string; publicRef: string; teaserTitle: string } | null
  canCreateListing: boolean
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('dashboard')

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('seller.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('seller.subtitle')}</p>
        </div>
        {/* `canPublishListing` (`@/lib/authz`) decided this on the server —
            the same predicate `/listings/new` itself enforces, so the button
            is never a shortcut past a check, only a way to skip typing the
            URL. */}
        {canCreateListing ? (
          <Link
            href="/listings/new"
            className={cn(
              'inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition hover:opacity-90',
              FOCUS_RING,
            )}
          >
            {t('seller.listings.newAction')}
          </Link>
        ) : null}
      </div>

      <Listings groups={overview.listingGroups} count={overview.listingCount} locale={locale} />

      <RequestQueues
        queues={overview.requestQueues}
        pendingCount={overview.pendingRequestCount}
        locale={locale}
      />

      <MatchedBuyers
        buyers={matchedBuyers}
        asset={matchedAsset}
        locale={locale}
        aiEnabled={aiEnabled}
      />

      <UnreadMessages count={overview.unreadMessageCount} />
    </main>
  )
}

/**
 * The seller's catalogue, grouped by status in `SELLER_STATUS_ORDER`
 * (`@/server/queries/asset-where`), which puts `REJECTED` and then
 * `PENDING_REVIEW` above everything else. Empty groups never reach here — the
 * grouping drops them — so a seller with nothing rejected sees no "Rejected"
 * heading rather than an empty one.
 *
 * A rejected listing renders its `rejectionReason` verbatim. That string is
 * written by a manager for this seller and is listed in `PUBLIC_ASSET_FIELDS`
 * (`@/lib/dto/asset`) precisely because it carries no deal information — but
 * it is still only ever rendered here, on the owning seller's own dashboard,
 * and on their own edit page.
 */
function Listings({
  groups,
  count,
  locale,
}: {
  groups: SellerListingGroup[]
  count: number
  locale: string
}) {
  const t = useTranslations('dashboard')
  const tAssets = useTranslations('assets')

  if (groups.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('seller.listings.title')}</h2>
        <p className="rounded-card border border-dashed border-border px-6 py-8 text-sm text-ink-muted">
          {t('seller.listings.empty')}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('seller.listings.title')}</h2>
      <p className="text-sm text-ink-muted">{t('seller.listings.count', { count })}</p>

      {groups.map((group) => (
        <Card key={group.status}>
          <CardHeader>
            <StatusPill status={group.status} />
            <span className="text-xs text-ink-muted">
              {t('seller.listings.count', { count: group.listings.length })}
            </span>
          </CardHeader>
          <CardBody>
            <ul>
              {group.listings.map((listing) => (
                <li
                  key={listing.id}
                  className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/listings/${listing.id}`}
                      className={cn(
                        'rounded-sm text-sm font-medium text-ink transition hover:text-accent',
                        FOCUS_RING,
                      )}
                    >
                      {listing.publicRef} · {listing.teaserTitle}
                    </Link>
                    <span className="text-sm text-ink">
                      {formatCents(listing.askingPriceCents, locale)}
                    </span>
                  </div>
                  <div className="meta-label flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{tAssets('card.views', { count: listing.viewCount })}</span>
                    {/* `listing.canEdit` is `assetStatusAllowsEditing`
                        (`@/lib/authz`), decided in `getSellerOverview` — not
                        `status !== 'SOLD'` re-derived here. `SELLER_STATUS_ORDER`
                        includes `SOLD` and this list renders every group, so
                        without it the demo seller's own dashboard offered an
                        Edit link on their sold listing that leads straight to
                        the edit page's `notFound()`. */}
                    {listing.canEdit ? (
                      <>
                        <span aria-hidden="true">&middot;</span>
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className={cn(
                            'rounded-sm text-accent normal-case transition hover:opacity-80',
                            FOCUS_RING,
                          )}
                        >
                          {t('seller.listings.editAction')}
                        </Link>
                      </>
                    ) : null}
                  </div>
                  {listing.status === 'REJECTED' && listing.rejectionReason ? (
                    <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ink">
                      <span className="meta-label block text-danger">
                        {t('seller.listings.rejectionReason')}
                      </span>
                      {listing.rejectionReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </section>
  )
}

/**
 * The catalogue-wide access-request queue, one `AccessRequestQueue` per
 * listing, ordered by `compareRequestQueues` so the buyer who has waited
 * longest is at the top of the page.
 *
 * Grouping by listing rather than flattening every request into one list is
 * what lets the existing component be reused verbatim: it takes an
 * `AssetRequestQueue` and knows nothing about which listing it belongs to, so
 * the listing is named in the heading above it instead. A flat list would
 * have meant a second, listing-aware approve/decline component — exactly the
 * duplication Task 14's handoff forbids.
 */
function RequestQueues({
  queues,
  pendingCount,
  locale,
}: {
  queues: SellerRequestQueue[]
  pendingCount: number
  locale: string
}) {
  const t = useTranslations('dashboard')

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('seller.requests.title')}</h2>

      {queues.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-6 py-8 text-sm text-ink-muted">
          {t('seller.requests.empty')}
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {t('seller.requests.pendingCount', { count: pendingCount })}
          </p>
          {queues.map(({ asset, queue }) => (
            <div key={asset.id} className="flex flex-col gap-2">
              <Link
                href={`/listings/${asset.id}`}
                className={cn(
                  'meta-label rounded-sm transition hover:text-ink',
                  FOCUS_RING,
                )}
              >
                {asset.publicRef} · {asset.teaserTitle}
              </Link>
              <AccessRequestQueue queue={queue} locale={locale} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}

/**
 * The buyers whose mandates best fit the seller's most recently published
 * listing — the same `BuyerCard` rows `/buyers` renders, scored by the same
 * `listBuyers` call, just cut to the top few.
 *
 * `NONE`-banded buyers are dropped upstream by the page
 * (`isRecommendableMatch`, `@/lib/matching`): the catalog at `/buyers` shows
 * every buyer a filter admits because the seller asked for that list, but a
 * dashboard suggestion of "no match" is not worth making. The "see all"
 * link therefore carries `forAsset` so the full, unfiltered ranking against
 * the same listing is one click away.
 */
function MatchedBuyers({
  buyers,
  asset,
  locale,
  aiEnabled,
}: {
  buyers: BuyerListItem[]
  asset: { id: string; publicRef: string; teaserTitle: string } | null
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('dashboard')

  if (asset === null) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('seller.matchedBuyers.title')}</h2>
        <p className="rounded-card border border-dashed border-border px-6 py-8 text-sm text-ink-muted">
          {t('seller.matchedBuyers.noPublished')}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('seller.matchedBuyers.title')}</h2>
        <Link
          href={{ pathname: '/buyers', query: { forAsset: asset.id } }}
          className={cn('rounded-sm text-sm text-accent transition hover:opacity-80', FOCUS_RING)}
        >
          {t('seller.matchedBuyers.viewAll')}
        </Link>
      </div>
      <p className="text-sm text-ink-muted">
        {t('seller.matchedBuyers.scoredAgainst', {
          ref: asset.publicRef,
          title: asset.teaserTitle,
        })}
      </p>

      {buyers.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-6 py-8 text-sm text-ink-muted">
          {t('seller.matchedBuyers.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {buyers.map((buyer) => (
            <li key={buyer.id}>
              <BuyerCard
                buyer={buyer}
                locale={locale}
                aiEnabled={aiEnabled}
                forAssetId={asset.id}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
