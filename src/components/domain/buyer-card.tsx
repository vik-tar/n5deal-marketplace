import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MatchBadge } from '@/components/domain/match-badge'
import { codeToFlag } from '@/lib/geo/flag'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { BuyerListItem } from '@/server/queries/buyers'

/**
 * Loose on purpose, matching every other `t()` alias in this codebase
 * (`listings/page.tsx`, `mandate-form.tsx`): this app does not augment
 * next-intl's `Messages` type.
 */
export type Translator = (key: string, values?: Record<string, string | number>) => string

/**
 * Exported alongside `BuyerCard` (not just used internally) so
 * `/buyers/[id]/page.tsx` renders the identical ticket-range text on the
 * detail page instead of re-deriving its own "any/from/to/range" phrasing.
 */
export function ticketLabel(
  min: number | null,
  max: number | null,
  locale: string,
  t: Translator,
): string {
  if (min === null && max === null) return t('card.ticketAny')
  if (min !== null && max !== null) {
    return t('card.ticketRange', {
      min: formatCents(min, locale),
      max: formatCents(max, locale),
    })
  }
  if (min !== null) return t('card.ticketFrom', { value: formatCents(min, locale) })
  return t('card.ticketTo', { value: formatCents(max as number, locale) })
}

/**
 * One row of the mandate as a labelled chip group: a translated "Any X" chip
 * when the buyer set no preference on that criterion (an empty array is
 * meaningful — Task 16's ruling 2 — not an unfinished field), otherwise one
 * chip per value the mandate actually constrains. Exported for the same
 * reason as `ticketLabel` above: `/buyers/[id]/page.tsx` renders the same
 * mandate shape in full, not just this card's condensed version.
 */
export function MandateGroup({
  label,
  values,
  anyLabel,
  translateValue,
}: {
  label: string
  values: string[]
  anyLabel: string
  translateValue: (value: string) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="meta-label">{label}</span>
      {values.length === 0 ? (
        <Badge tone="neutral">{anyLabel}</Badge>
      ) : (
        values.map((value) => (
          <Badge key={value} tone="accent">
            {translateValue(value)}
          </Badge>
        ))
      )}
    </div>
  )
}

/**
 * The seller-facing buyer card: identity and mandate on the left, the match
 * badge (when this list was scored against a listing — `buyer.match` is
 * `null` otherwise) and ticket size on the right. The card links to
 * `/buyers/[id]`, carrying `forAssetId` through the query string so the
 * detail page shows the identical scored view the card linked from —
 * ruling 3's "scored against" state is shareable the same way the asset
 * catalog's own filters are (ruling 7).
 *
 * That link is a *stretched* link on the buyer's name, not a wrapper around
 * the whole card. The card contains `MatchBadge`, which renders a `<button>`:
 * HTML forbids interactive content inside an `<a>`, and in practice the
 * anchor took the click, so opening the match-reasons disclosure navigated
 * away instead — the deterministic reasons list and the AI explanation
 * underneath it (Task 9) were unreachable from this card entirely. The
 * `after:absolute after:inset-0` overlay below restores the whole-card click
 * target without nesting anything inside the anchor, and the badge sits above
 * that overlay on `relative z-10`. The focus ring lands on the name rather
 * than the card, which is the correct affordance: the name is the link.
 */
export function BuyerCard({
  buyer,
  locale,
  aiEnabled,
  forAssetId,
}: {
  buyer: BuyerListItem
  locale: string
  aiEnabled: boolean
  forAssetId: string | null
}) {
  const t = useTranslations('buyers')
  const tProfile = useTranslations('profile')
  const tAssets = useTranslations('assets')
  const flag = codeToFlag(buyer.country)

  const href = forAssetId
    ? `/buyers/${buyer.id}?${new URLSearchParams({ forAsset: forAssetId }).toString()}`
    : `/buyers/${buyer.id}`

  return (
    <Card className="relative transition hover:border-accent/60">
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            {flag ? (
              <span aria-hidden="true" className="text-base leading-none">
                {flag}
              </span>
            ) : null}
            <span>{buyer.country}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{tProfile(`buyerType.${buyer.buyerType}`)}</span>
            {buyer.verified ? <Badge tone="success">{t('card.verifiedBadge')}</Badge> : null}
          </div>

          <h3 className="text-lg font-semibold text-ink">
            <Link
              href={href}
              className={cn('rounded-sm after:absolute after:inset-0', FOCUS_RING)}
            >
              {buyer.displayName}
            </Link>
          </h3>

          <div className="flex flex-col gap-1.5">
            <MandateGroup
              label={t('card.categoriesLabel')}
              values={buyer.mandate.categories}
              anyLabel={tProfile('mandate.any.category')}
              translateValue={(value) => tAssets(`category.${value}`)}
            />
            <MandateGroup
              label={t('card.countriesLabel')}
              values={buyer.mandate.countries}
              anyLabel={tProfile('mandate.any.country')}
              translateValue={(value) => {
                const countryFlag = codeToFlag(value)
                return countryFlag ? `${countryFlag} ${value}` : value
              }}
            />
            <MandateGroup
              label={t('card.licenceTypesLabel')}
              values={buyer.mandate.licenceTypes}
              anyLabel={tProfile('mandate.any.licenceType')}
              translateValue={(value) => tProfile(`licenceType.${value}`)}
            />
          </div>

          <p className="text-xs text-ink-muted">
            {buyer.mandate.specificity === 0
              ? t('card.specificityUnconstrained')
              : t('card.specificity', { count: buyer.mandate.specificity })}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {/* Above the name's `after:inset-0` overlay, so a click toggles
              the disclosure instead of following the link. */}
          {buyer.match ? (
            <div className="relative z-10">
              <MatchBadge result={buyer.match} locale={locale} aiEnabled={aiEnabled} />
            </div>
          ) : null}
          <div className="text-left sm:text-right">
            <p className="meta-label">{t('card.ticketLabel')}</p>
            <p className="text-sm font-medium text-ink">
              {ticketLabel(
                buyer.mandate.ticketMinCents,
                buyer.mandate.ticketMaxCents,
                locale,
                t,
              )}
            </p>
          </div>
        </div>
    </CardBody>
    </Card>
  )
}
