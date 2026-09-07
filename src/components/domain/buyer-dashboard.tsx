import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { AssetCard } from '@/components/domain/asset-card'
import { MatchBadge } from '@/components/domain/match-badge'
import { StatusPill } from '@/components/domain/status-pill'
import { MandateGroup, ticketLabel } from '@/components/domain/buyer-card'
import { isMandateRankable } from '@/lib/matching'
import { codeToFlag } from '@/lib/geo/flag'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { RecommendedAssetsResult } from '@/server/queries/assets'
import type { BuyerOverview, BuyerRequestGroup } from '@/server/queries/buyers'
import { dateFormatter } from '@/lib/datetime'

/**
 * The buyer's half of `/dashboard`. A server component with no fetching of
 * its own: the page loads `getBuyerOverview` and `getRecommendedAssets` and
 * hands the results down as plain props, the same split `asset-card.tsx` and
 * `buyer-card.tsx` already use. `aiEnabled` arrives the same way, because
 * `MatchBadge` is a client component and cannot read `process.env` itself.
 *
 * Almost every label here is borrowed from namespaces that already exist —
 * `profile.mandate.fields.*` and `profile.mandate.any.*` for the mandate
 * summary, `buyers.card.ticket*` through the shared `ticketLabel`, `status.*`
 * through `StatusPill`. New `dashboard.*` keys were added only for copy that
 * genuinely says something new; a second English wording of "Jurisdictions"
 * would be two strings to keep in sync in two catalogues for no gain.
 */
export function BuyerDashboard({
  overview,
  recommendations,
  locale,
  aiEnabled,
}: {
  overview: BuyerOverview
  recommendations: RecommendedAssetsResult
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('dashboard')

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('buyer.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('buyer.subtitle')}</p>
      </div>

      <MandateSummary mandate={overview.mandate} locale={locale} />

      <Recommendations recommendations={recommendations} locale={locale} aiEnabled={aiEnabled} />

      <RequestGroups groups={overview.requestGroups} locale={locale} />

      <UnreadMessages count={overview.unreadMessageCount} />
    </main>
  )
}

/** The mandate every score on this page was computed from, with a way to change it. */
function MandateSummary({
  mandate,
  locale,
}: {
  mandate: BuyerOverview['mandate']
  locale: string
}) {
  const t = useTranslations('dashboard')
  const tProfile = useTranslations('profile')
  const tAssets = useTranslations('assets')
  const tBuyers = useTranslations('buyers')

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('buyer.mandate.title')}</h2>
        <Link
          href="/profile"
          className={cn('rounded-sm text-sm text-accent transition hover:opacity-80', FOCUS_RING)}
        >
          {t('buyer.mandate.editAction')}
        </Link>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        <MandateGroup
          label={tProfile('mandate.fields.categoriesLabel')}
          values={mandate.categories}
          anyLabel={tProfile('mandate.any.category')}
          translateValue={(value) => tAssets(`category.${value}`)}
        />
        <MandateGroup
          label={tProfile('mandate.fields.countriesLabel')}
          values={mandate.countries}
          anyLabel={tProfile('mandate.any.country')}
          translateValue={(value) => {
            const flag = codeToFlag(value)
            return flag ? `${flag} ${value}` : value
          }}
        />
        <MandateGroup
          label={tProfile('mandate.fields.licenceTypesLabel')}
          values={mandate.licenceTypes}
          anyLabel={tProfile('mandate.any.licenceType')}
          translateValue={(value) => tProfile(`licenceType.${value}`)}
        />
        <MandateGroup
          label={tProfile('mandate.fields.businessStatusesLabel')}
          values={mandate.businessStatuses}
          anyLabel={tProfile('mandate.any.businessStatus')}
          translateValue={(value) => tAssets(`businessStatus.${value}`)}
        />
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="meta-label">{tBuyers('card.ticketLabel')}</span>
          <span className="text-sm text-ink">
            {ticketLabel(mandate.ticketMinCents, mandate.ticketMaxCents, locale, tBuyers)}
          </span>
        </div>
        <p className="text-xs text-ink-muted">
          {mandate.specificity === 0
            ? tBuyers('card.specificityUnconstrained')
            : tBuyers('card.specificity', { count: mandate.specificity })}
        </p>
      </CardBody>
    </Card>
  )
}

/**
 * The ranked recommendations — or, at `specificity` 0, the prompt that
 * replaces them.
 *
 * That branch is the whole point of this section. A mandate constraining
 * nothing scores every listing at exactly 100 in the `STRONG` band, so a
 * "top 5" would be five listings the buyer was never matched against wearing
 * badges that say "Strong match". `getRecommendedAssets` refuses to build
 * that list and this renders the way to fix it in its place — both through
 * the *same* `isMandateRankable` (`@/lib/matching`), not through two inline
 * `specificity === 0` tests that could drift apart. The condition read here
 * is the query's own `specificity`, not a recount and not `items.length === 0`
 * — an empty list has two other causes (every listing scored `NONE`, or there
 * are no published listings at all), and conflating them would tell a buyer
 * with a precise mandate to go fill in the mandate they already filled in.
 *
 * The `mandate.specificity === 0` test in `MandateSummary` above is
 * deliberately *not* routed through the same predicate: it chooses between
 * two descriptions of the mandate itself, which is a display question, not
 * the "may this be ranked" question this one answers.
 *
 * When the ranking does render, the label above it names how many of the five
 * criteria produced it, so a 100 from two criteria is not read as a 100 from
 * five.
 *
 * The `MatchBadge` sits above its card rather than inside it: `AssetCard` is
 * one big `Link`, and the badge is a `button` that opens the reasons
 * disclosure. Nesting an interactive control inside an anchor gives the
 * browser no sane click target and is invalid HTML.
 */
function Recommendations({
  recommendations,
  locale,
  aiEnabled,
}: {
  recommendations: RecommendedAssetsResult
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('dashboard')

  if (!isMandateRankable(recommendations.specificity)) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{t('buyer.recommendations.title')}</h2>
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border px-6 py-8">
          <p className="text-base font-semibold text-ink">
            {t('buyer.recommendations.completeMandateTitle')}
          </p>
          <p className="max-w-xl text-sm text-ink-muted">
            {t('buyer.recommendations.completeMandateBody')}
          </p>
          <Link
            href="/profile"
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition hover:opacity-90',
              FOCUS_RING,
            )}
          >
            {t('buyer.recommendations.completeMandateAction')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('buyer.recommendations.title')}</h2>
      <p className="text-sm text-ink-muted">
        {t('buyer.recommendations.basedOn', {
          criteria: recommendations.specificity,
          considered: recommendations.consideredCount,
        })}
      </p>

      {recommendations.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border px-6 py-8">
          {/* Two different empty lists, told apart by the query's own
              `consideredCount`: "nothing published yet" is not the buyer's
              mandate's fault and must not be answered with "widen a
              criterion". Unreachable against the seeded catalogue of 34, and
              reachable on a fresh deployment before the first approval. */}
          <p className="text-sm text-ink-muted">
            {recommendations.consideredCount === 0
              ? t('buyer.recommendations.noListings')
              : t('buyer.recommendations.empty')}
          </p>
          <Link
            href="/listings"
            className={cn('rounded-sm text-sm text-accent transition hover:opacity-80', FOCUS_RING)}
          >
            {t('buyer.recommendations.browseAction')}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {recommendations.items.map(({ asset, match }) => (
            <li key={asset.id} className="flex flex-col gap-2">
              <MatchBadge result={match} locale={locale} aiEnabled={aiEnabled} />
              <AssetCard asset={asset} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The buyer's own access requests, newest first inside each status group. */
function RequestGroups({ groups, locale }: { groups: BuyerRequestGroup[]; locale: string }) {
  const t = useTranslations('dashboard')
  const dateFormat = dateFormatter(locale)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('buyer.requests.title')}</h2>

      {groups.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-6 py-8 text-sm text-ink-muted">
          {t('buyer.requests.empty')}
        </p>
      ) : (
        groups.map((group) => (
          <Card key={group.status}>
            <CardHeader>
              <StatusPill status={group.status} />
              <span className="text-xs text-ink-muted">
                {t('buyer.requests.count', { count: group.requests.length })}
              </span>
            </CardHeader>
            <CardBody>
              <ul>
                {group.requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0"
                  >
                    <Link
                      href={`/listings/${request.assetId}`}
                      className={cn(
                        'rounded-sm text-sm font-medium text-ink transition hover:text-accent',
                        FOCUS_RING,
                      )}
                    >
                      {request.assetPublicRef} · {request.assetTeaserTitle}
                    </Link>
                    <span className="text-xs text-ink-muted">
                      {request.decidedAt
                        ? t('buyer.requests.decidedOn', {
                            date: dateFormat.format(request.decidedAt),
                          })
                        : t('buyer.requests.requestedOn', {
                            date: dateFormat.format(request.requestedAt),
                          })}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))
      )}
    </section>
  )
}

/**
 * The unread-message card, exported and rendered by the seller dashboard too:
 * the question ("how much mail is waiting, and where do I read it") and the
 * answer are identical on both sides of the market, so the copy lives under a
 * role-neutral `dashboard.messages.*` rather than twice under
 * `dashboard.buyer.*` and `dashboard.seller.*`.
 *
 * The count comes from the overview query on either side, which excludes the
 * viewer's own sent messages — `Message.readAt` is null from the moment a
 * message is written, so counting the column alone would report a viewer's own
 * outbox back to them as unread mail.
 */
export function UnreadMessages({ count }: { count: number }) {
  const t = useTranslations('dashboard')

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('messages.title')}</h2>
        <Link
          href="/inbox"
          className={cn('rounded-sm text-sm text-accent transition hover:opacity-80', FOCUS_RING)}
        >
          {t('messages.openInbox')}
        </Link>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-ink-muted">
          {count === 0 ? t('messages.none') : t('messages.unread', { count })}
        </p>
      </CardBody>
    </Card>
  )
}
