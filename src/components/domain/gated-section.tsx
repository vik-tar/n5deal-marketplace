import { useTranslations } from 'next-intl'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { RequestAccessForm } from '@/components/domain/request-access-form'
import { FOCUS_RING, cn } from '@/lib/cn'
import { isFullAsset, type AssetDto, type FullAsset } from '@/lib/dto/asset'
import { formatCents } from '@/lib/money'
import { SIGN_IN_HREF } from '@/lib/nav'
import { Link } from '@/i18n/navigation'
import type { GrantState } from '@/lib/authz'
import type { GateStatus } from '@/lib/gate'
import { formatDate } from '@/lib/datetime'

/**
 * The NDA gate. Renders exactly one of four states, chosen server-side
 * (`getAssetDetail`, `@/server/queries/assets`) — this component does not
 * re-derive who may see what, it only presents the answer it was handed.
 *
 * The "open" branch is additionally guarded by `isFullAsset(dto)` here, not
 * just by trusting `gateStatus === 'OPEN'`: if the two ever disagreed, this
 * still renders the closed explanation rather than confidential data, so a
 * bug in the gate-status calculation fails closed, not open. Whichever
 * branch runs, the confidential fields simply do not exist on `dto` unless
 * the gate actually opened — there is nothing here to hide with CSS, because
 * there is nothing here to hide.
 */
export function GatedSection({
  dto,
  gateStatus,
  grant,
  requestedAt,
  isAnonymous,
  locale,
  assetId,
}: {
  dto: AssetDto
  gateStatus: GateStatus
  grant: GrantState
  requestedAt: Date | null
  isAnonymous: boolean
  locale: string
  assetId: string
}) {
  const t = useTranslations('gate')

  if (isFullAsset(dto)) {
    return <OpenGate dto={dto} locale={locale} />
  }

  if (gateStatus === 'PENDING') {
    return <PendingGate requestedAt={requestedAt} locale={locale} />
  }

  if (gateStatus === 'REQUESTABLE') {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink">{t('requestable.title')}</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">{t('requestable.body')}</p>
          <RequestAccessForm assetId={assetId} locale={locale} />
        </CardBody>
      </Card>
    )
  }

  return <ClosedGate grant={grant} isAnonymous={isAnonymous} />
}

function OpenGate({ dto, locale }: { dto: FullAsset; locale: string }) {
  const t = useTranslations('gate')

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('open.title')}</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="meta-label">{t('open.legalName')}</dt>
            <dd className="text-sm text-ink">{dto.legalName}</dd>
          </div>
          <div>
            <dt className="meta-label">{t('open.revenue')}</dt>
            <dd className="text-sm text-ink">{formatCents(dto.revenueCents, locale)}</dd>
          </div>
          <div>
            <dt className="meta-label">{t('open.ebitda')}</dt>
            <dd className="text-sm text-ink">{formatCents(dto.ebitdaCents, locale)}</dd>
          </div>
          <div>
            <dt className="meta-label">{t('open.clientCount')}</dt>
            <dd className="text-sm text-ink">{dto.clientCount.toLocaleString(locale)}</dd>
          </div>
        </dl>

        {dto.dataRoomUrl ? (
          <div>
            <p className="meta-label">{t('open.dataRoomLabel')}</p>
            <a
              href={dto.dataRoomUrl}
              target="_blank"
              rel="noreferrer"
              className={cn('text-sm text-accent underline underline-offset-2', FOCUS_RING, 'rounded-sm')}
            >
              {t('open.dataRoomLink')}
            </a>
          </div>
        ) : null}

        {dto.confidentialNotes.length > 0 ? (
          <div>
            <p className="meta-label">{t('open.notesLabel')}</p>
            <p className="text-sm text-ink">{dto.confidentialNotes}</p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

function PendingGate({ requestedAt, locale }: { requestedAt: Date | null; locale: string }) {
  const t = useTranslations('gate')
  const date = requestedAt ? formatDate(requestedAt, locale) : ''

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('pending.title')}</h2>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-ink-muted">{t('pending.body', { date })}</p>
      </CardBody>
    </Card>
  )
}

/** Declined, revoked, anonymous, or a seller/buyer looking at someone else's listing. */
function ClosedGate({ grant, isAnonymous }: { grant: GrantState; isAnonymous: boolean }) {
  const t = useTranslations('gate')

  const bodyKey =
    grant === 'DECLINED' ? 'closed.declined' : grant === 'REVOKED' ? 'closed.revoked' : 'closed.default'

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('closed.title')}</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t(bodyKey)}</p>
        {isAnonymous ? (
          <div>
            <p className="text-sm text-ink-muted">{t('closed.signInPrompt')}</p>
            <Link
              href={SIGN_IN_HREF}
              className={cn(
                'mt-2 inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-accent-ink transition hover:opacity-90',
                FOCUS_RING,
              )}
            >
              {t('closed.signInAction')}
            </Link>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
