import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { codeToFlag } from '@/lib/geo/flag'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { TeaserAsset } from '@/lib/dto/asset'

/**
 * The reference product's horizontal listing card: reference + flag on one
 * line, the teaser title, a row of small-caps facts, the "included" chips,
 * the view count, and the asking price set larger to the right. The whole
 * card is one link to the detail page (`/listings/[id]`, Task 13).
 */
export function AssetCard({ asset, locale }: { asset: TeaserAsset; locale: string }) {
  const t = useTranslations('assets')
  const flag = codeToFlag(asset.country)

  return (
    <Link href={`/listings/${asset.id}`} className={cn('block rounded-card', FOCUS_RING)}>
      <Card className="transition hover:border-accent/60">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              {flag ? (
                <span aria-hidden="true" className="text-base leading-none">
                  {flag}
                </span>
              ) : null}
              <span>{asset.publicRef}</span>
            </div>

            <h3 className="text-lg font-semibold text-ink">{asset.teaserTitle}</h3>

            <div className="meta-label flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t(`category.${asset.category}`)}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{asset.licenceType}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{asset.regulator}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{t(`businessStatus.${asset.businessStatus}`)}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{t('card.employees', { count: asset.employees })}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{t('card.yearOfIssue', { year: asset.yearOfIssue })}</span>
            </div>

            {asset.included.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="meta-label">{t('card.includedLabel')}</span>
                {asset.included.map((item) => (
                  <Badge key={item} tone="neutral" className="normal-case">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}

            <p className="text-xs text-ink-muted">{t('card.views', { count: asset.viewCount })}</p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="meta-label">{t('card.askingPrice')}</p>
            <p className="text-2xl font-semibold text-ink">
              {formatCents(asset.askingPriceCents, locale)}
            </p>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}
