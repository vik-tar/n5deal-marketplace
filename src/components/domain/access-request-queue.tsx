'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { decideAccess, revokeAccess } from '@/server/actions/access-requests'
import type { ActionResult } from '@/server/actions/types'
import type { AssetRequestQueue } from '@/server/queries/assets'
import { formatDate } from '@/lib/datetime'

/** Disables its button and swaps its label while its own form is submitting. */
function ActionButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string
  pendingLabel: string
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function ErrorLine({ state }: { state: ActionResult | null }) {
  const t = useTranslations('requestQueue.error')
  if (!state || state.ok) return null
  return (
    <p role="alert" className="text-xs text-danger">
      {t(state.error)}
    </p>
  )
}

/**
 * `canDecide` is `AssetRequestQueue.canDecide` (`@/server/queries/assets`),
 * which is `canDecideAccess` — the owning seller only. When it is false the
 * two buttons are **omitted, not disabled**: unlike `ContactButton`, where a
 * disabled control plus a reason tells the viewer something they can act on,
 * a manager has no route to approving anything and a greyed-out Approve
 * would only invite the click it is there to prevent. The row itself stays,
 * because a manager reading a listing's queue is a legitimate thing to do —
 * they just read it.
 */
function PendingRow({
  requestId,
  buyerDisplayName,
  message,
  requestedAt,
  canDecide,
  locale,
}: {
  requestId: string
  buyerDisplayName: string
  message: string
  requestedAt: Date
  canDecide: boolean
  locale: string
}) {
  const t = useTranslations('requestQueue')
  const date = formatDate(requestedAt, locale)

  const [approveState, approveAction] = useActionState<ActionResult | null>(async () => {
    return decideAccess({ requestId, decision: 'APPROVED', locale })
  }, null)
  const [declineState, declineAction] = useActionState<ActionResult | null>(async () => {
    return decideAccess({ requestId, decision: 'DECLINED', locale })
  }, null)

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{buyerDisplayName}</span>
        <span className="text-xs text-ink-muted">{t('requestedOn', { date })}</span>
      </div>
      {message.length > 0 ? <p className="text-sm text-ink-muted">{message}</p> : null}
      {canDecide ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <form action={approveAction}>
              <ActionButton label={t('approve')} pendingLabel={t('approving')} />
            </form>
            <form action={declineAction}>
              <ActionButton label={t('decline')} pendingLabel={t('declining')} variant="secondary" />
            </form>
          </div>
          <ErrorLine state={approveState} />
          <ErrorLine state={declineState} />
        </>
      ) : null}
    </li>
  )
}

function ApprovedRow({
  requestId,
  buyerDisplayName,
  decidedAt,
  locale,
}: {
  requestId: string
  buyerDisplayName: string
  decidedAt: Date | null
  locale: string
}) {
  const t = useTranslations('requestQueue')
  const date = decidedAt ? formatDate(decidedAt, locale) : ''

  const [state, revokeFormAction] = useActionState<ActionResult | null>(async () => {
    return revokeAccess({ requestId, locale })
  }, null)

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{buyerDisplayName}</span>
        {date ? <span className="text-xs text-ink-muted">{t('decidedOn', { date })}</span> : null}
      </div>
      <div>
        <form action={revokeFormAction}>
          <ActionButton label={t('revoke')} pendingLabel={t('revoking')} variant="danger" />
        </form>
      </div>
      <ErrorLine state={state} />
    </li>
  )
}

/**
 * The requests standing against one listing: the owning seller decides them,
 * a manager reads them and may revoke an approved grant. Invisible to every
 * other viewer, since `queue` already comes back empty for them
 * (`getAssetRequestQueue`, `@/server/queries/assets`). Renders nothing at
 * all when there is genuinely nothing to show, rather than an empty card.
 *
 * **Deciding and revoking are two different permissions here**, and the card
 * used to offer both to whoever could see it. `canDecideAccess`
 * (`@/lib/authz`) is `isOwner && grant === 'REQUESTED'` and a `MANAGER`
 * holds no `SellerProfile`, so every Approve and Decline a manager pressed
 * came back `FORBIDDEN` and printed "This request can no longer be acted
 * on" — a sentence that is wrong in both halves: it could be, and never by
 * them. Revoke, which `canRevokeAccess` does grant a manager, worked the
 * whole time, so the card was half-live rather than plainly broken. It now
 * follows `queue.canDecide`, and says why the buttons are absent.
 */
export function AccessRequestQueue({ queue, locale }: { queue: AssetRequestQueue; locale: string }) {
  const t = useTranslations('requestQueue')

  if (queue.pending.length === 0 && queue.approved.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">{t('title')}</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {queue.pending.length > 0 ? (
          <div>
            <p className="meta-label">{t('pendingTitle')}</p>
            {queue.canDecide ? null : (
              <p className="text-xs text-ink-muted">{t('decideOwnerOnly')}</p>
            )}
            <ul>
              {queue.pending.map((request) => (
                <PendingRow
                  key={request.id}
                  locale={locale}
                  requestId={request.id}
                  buyerDisplayName={request.buyerDisplayName}
                  message={request.message}
                  requestedAt={request.requestedAt}
                  canDecide={queue.canDecide}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {queue.approved.length > 0 ? (
          <div>
            <p className="meta-label">{t('approvedTitle')}</p>
            <ul>
              {queue.approved.map((grant) => (
                <ApprovedRow
                  key={grant.id}
                  locale={locale}
                  requestId={grant.id}
                  buyerDisplayName={grant.buyerDisplayName}
                  decidedAt={grant.decidedAt}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
