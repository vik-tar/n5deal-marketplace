import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ContactButton } from '@/components/domain/contact-button'
import { MatchBadge } from '@/components/domain/match-badge'
import { MandateGroup, ticketLabel } from '@/components/domain/buyer-card'
import { getBuyerDetail } from '@/server/queries/buyers'
import { getViewer } from '@/server/session'
import { isAiEnabled } from '@/lib/ai/client'
import { codeToFlag } from '@/lib/geo/flag'
import { parseForAssetId } from '@/lib/filters/buyer-filters'
import type { RawSearchParams } from '@/lib/filters/shared'

/**
 * The buyer profile and full mandate a seller (or a manager) reaches from
 * the catalog (`/buyers`, Task 17). `forAsset` in the query string — set by
 * `BuyerCard`'s own link when the catalog list was scored — is re-verified
 * here through the identical ownership-checked path `listBuyers` uses
 * (`getBuyerDetail`'s own `forAssetId` parameter), not trusted at face
 * value: a seller cannot get a match breakdown against a listing they do not
 * own just by hand-editing this page's URL, exactly as they could not from
 * the catalog.
 *
 * "Contact buyer" opens a thread through `startConversation`
 * (`@/server/actions/messages`) and navigates into it — see `ContactButton`,
 * which both entry points share. It is rendered disabled — never omitted —
 * when `detail.canContact` is not `'ALLOWED'`, and the reason it carries is
 * what the button prints: a manager is told that managers moderate rather
 * than transact, a seller with no `SellerProfile` row that only a seller
 * account can open this thread, and only a genuinely suspended buyer is
 * described as unmessageable. It used to be a boolean and all three read
 * "This account cannot be messaged", which was true for the last case only.
 * `'SIGN_IN'` cannot occur here: `getBuyerDetail` already 404s for a viewer
 * who is not an active seller or manager, so no anonymous visitor ever
 * renders this page.
 */
export default async function BuyerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { locale, id } = await params
  const rawSearchParams = await searchParams
  const forAssetId = parseForAssetId(rawSearchParams)

  const [viewer, t, tProfile, tAssets, tBuyers] = await Promise.all([
    getViewer(),
    getTranslations('buyerDetail'),
    getTranslations('profile'),
    getTranslations('assets'),
    getTranslations('buyers'),
  ])

  // `getBuyerDetail` returns `null` for both "does not exist" and "exists but
  // this viewer may not see it" (not a seller/manager, or the buyer's own
  // account is not active) — a 404 either way, mirroring `getAssetDetail`'s
  // identical "hidden and non-existent look the same" rule.
  const detail = await getBuyerDetail(id, viewer, forAssetId)
  if (!detail) notFound()

  const aiEnabled = isAiEnabled()
  const flag = codeToFlag(detail.country)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              {flag ? (
                <span aria-hidden="true" className="text-base leading-none">
                  {flag}
                </span>
              ) : null}
              <span>{detail.country}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{tProfile(`buyerType.${detail.buyerType}`)}</span>
              {detail.verified ? <Badge tone="success">{t('verifiedBadge')}</Badge> : null}
            </div>
            <h1 className="text-2xl font-semibold text-ink">{detail.displayName}</h1>
          </div>

          {detail.match ? (
            <div className="shrink-0">
              <MatchBadge result={detail.match} locale={locale} aiEnabled={aiEnabled} />
            </div>
          ) : null}
        </CardHeader>

        <CardBody className="flex flex-col gap-6">
          <div>
            <p className="meta-label">{t('bioTitle')}</p>
            <p className="mt-1 text-sm text-ink">{detail.bio || t('noBio')}</p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="meta-label">{t('mandateTitle')}</p>
            <MandateGroup
              label={tProfile('mandate.fields.categoriesLabel')}
              values={detail.mandate.categories}
              anyLabel={tProfile('mandate.any.category')}
              translateValue={(value) => tAssets(`category.${value}`)}
            />
            <MandateGroup
              label={tProfile('mandate.fields.countriesLabel')}
              values={detail.mandate.countries}
              anyLabel={tProfile('mandate.any.country')}
              translateValue={(value) => {
                const countryFlag = codeToFlag(value)
                return countryFlag ? `${countryFlag} ${value}` : value
              }}
            />
            <MandateGroup
              label={tProfile('mandate.fields.licenceTypesLabel')}
              values={detail.mandate.licenceTypes}
              anyLabel={tProfile('mandate.any.licenceType')}
              translateValue={(value) => tProfile(`licenceType.${value}`)}
            />
            <MandateGroup
              label={tProfile('mandate.fields.businessStatusesLabel')}
              values={detail.mandate.businessStatuses}
              anyLabel={tProfile('mandate.any.businessStatus')}
              translateValue={(value) => tAssets(`businessStatus.${value}`)}
            />
            <p className="text-sm text-ink">
              <span className="meta-label mr-2">{t('ticketLabel')}</span>
              {ticketLabel(
                detail.mandate.ticketMinCents,
                detail.mandate.ticketMaxCents,
                locale,
                tBuyers,
              )}
            </p>
            <p className="text-xs text-ink-muted">
              {/* `buyers.*`, not `buyerDetail.*`: the card and this page render
                  the same sentence in the same `text-xs text-ink-muted` line
                  one click apart, and used to do it from two key pairs whose
                  unconstrained halves were already byte-identical in both
                  locales. One string now, in the namespace both surfaces
                  already load. */}
              {detail.mandate.specificity === 0
                ? tBuyers('specificityUnconstrained')
                : tBuyers('specificity', { count: detail.mandate.specificity })}
            </p>
          </div>

          {!detail.match ? <p className="text-sm text-ink-muted">{t('notScored')}</p> : null}

          <div className="border-t border-border pt-4">
            <ContactButton
              target={{ kind: 'buyer', buyerProfileId: detail.id }}
              availability={detail.canContact}
              locale={locale}
            />
          </div>
        </CardBody>
      </Card>
    </main>
  )
}
