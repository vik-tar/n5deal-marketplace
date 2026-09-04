import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusPill } from '@/components/domain/status-pill'
import { GatedSection } from '@/components/domain/gated-section'
import { AccessRequestQueue } from '@/components/domain/access-request-queue'
import { getAssetDetail, type SellerSummary } from '@/server/queries/assets'
import { getViewer } from '@/server/session'
import { codeToFlag } from '@/lib/geo/flag'
import { formatCents } from '@/lib/money'

/**
 * Loose on purpose, matching `src/app/[locale]/listings/page.tsx`: this app
 * does not augment next-intl's `Messages` type, so every `t()` call already
 * takes a plain string key.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const [viewer, t] = await Promise.all([getViewer(), getTranslations()])

  // `getAssetDetail` returns `null` for both "does not exist" and "exists but
  // this viewer may not see it" — a 404 either way, never a 403 that would
  // confirm a hidden listing is there.
  const detail = await getAssetDetail(id, viewer)
  if (!detail) notFound()

  const { asset, grant, seller, gateStatus, requestedAt, requestQueue } = detail
  const flag = codeToFlag(asset.country)

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Card>
        <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              {flag ? (
                <span aria-hidden="true" className="text-base leading-none">
                  {flag}
                </span>
              ) : null}
              <span>{asset.publicRef}</span>
              <StatusPill status={asset.status} />
            </div>
            <h1 className="text-2xl font-semibold text-ink">{asset.teaserTitle}</h1>
          </div>

          <div className="shrink-0 text-left sm:ml-auto sm:text-right">
            <p className="meta-label">{t('assets.card.askingPrice')}</p>
            <p className="text-2xl font-semibold text-ink">
              {formatCents(asset.askingPriceCents, locale)}
            </p>
          </div>
        </CardHeader>

        <CardBody className="flex flex-col gap-6">
          <div className="meta-label flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t(`assets.category.${asset.category}`)}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{asset.licenceType}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{asset.regulator}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{t(`assets.businessStatus.${asset.businessStatus}`)}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{t('assets.card.employees', { count: asset.employees })}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{t('assets.card.yearOfIssue', { year: asset.yearOfIssue })}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{t('assets.card.views', { count: asset.viewCount })}</span>
          </div>

          <div>
            <p className="meta-label">{t('assetDetail.descriptionLabel')}</p>
            <p className="mt-1 text-sm text-ink">{asset.teaserDescription}</p>
          </div>

          {asset.included.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="meta-label">{t('assets.card.includedLabel')}</span>
              {asset.included.map((item) => (
                <Badge key={item} tone="neutral" className="normal-case">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}

          <SellerStrip seller={seller} t={t} />
        </CardBody>
      </Card>

      <GatedSection
        dto={asset}
        gateStatus={gateStatus}
        grant={grant}
        requestedAt={requestedAt}
        isAnonymous={viewer === null}
        locale={locale}
        assetId={id}
      />

      <AccessRequestQueue queue={requestQueue} locale={locale} />
    </main>
  )
}

/**
 * `seller.companyName` is `null` whenever the gate is closed (the redaction
 * happens in `getAssetDetail`, not here) — the fallback identity text never
 * asserts a verification status this seller does not actually have; the
 * `verified` badge is shown only when `seller.verified` is actually true.
 */
function SellerStrip({ seller, t }: { seller: SellerSummary; t: Translator }) {
  const flag = codeToFlag(seller.country)

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
      <span className="font-medium text-ink">{seller.companyName ?? t('assetDetail.seller.label')}</span>
      {seller.verified ? <Badge tone="success">{t('assetDetail.seller.verifiedBadge')}</Badge> : null}
      <span className="text-ink-muted">
        {flag ? `${flag} ` : ''}
        {seller.country}
      </span>
    </div>
  )
}
