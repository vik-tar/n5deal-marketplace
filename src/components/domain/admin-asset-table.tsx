'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { StatusPill } from '@/components/domain/status-pill'
import { ModerationDialog } from '@/components/domain/moderation-dialog'
import { moderateListing } from '@/server/actions/moderation'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { AdminAssetRow } from '@/server/queries/admin'

/**
 * The console's listings tab: every listing in every status, review queue
 * first (`compareAdminAssets`, `@/server/queries/admin-where`), with the
 * approve / reject / suspend decisions on each row.
 *
 * A client component for the same reason `ParticipantTable` is one — the
 * buttons open `ModerationDialog` and call a Server Action — and it obeys the
 * same rule about nesting: the reference cell holds a plain `Link` to the
 * listing, the actions cell holds buttons, and neither is inside the other.
 * Commit `970621a` fixed exactly the opposite arrangement in `buyer-card.tsx`,
 * where an anchor wrapped a button and took every click meant for it.
 *
 * The link is real for a manager on every row: `canViewAsset` (`@/lib/authz`)
 * returns `true` for them on any status, so a draft or a suspended seller's
 * listing opens rather than 404ing — which is what makes reviewing a pending
 * listing possible at all. Opening it does not inflate the listing's
 * `viewCount` either: `getAssetDetail` (`@/server/queries/assets`) exempts
 * owners and managers from the increment.
 */
export function AdminAssetTable({
  rows,
  locale,
}: {
  rows: AdminAssetRow[]
  /** Travels into every action call; validated server-side by `toAppLocale`. */
  locale: string
}) {
  const t = useTranslations('admin.assets')

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {t('empty')}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-4xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>{t('columns.listing')}</Th>
            <Th>{t('columns.status')}</Th>
            <Th>{t('columns.seller')}</Th>
            <Th>{t('columns.category')}</Th>
            <Th>{t('columns.price')}</Th>
            <Th>{t('columns.actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AssetRowView key={row.id} row={row} locale={locale} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="meta-label px-3 py-2 font-medium whitespace-nowrap">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>
}

function AssetRowView({ row, locale }: { row: AdminAssetRow; locale: string }) {
  const t = useTranslations('admin.assets')
  const tAssets = useTranslations('assets')

  return (
    <tr className="border-b border-border last:border-b-0">
      <Td>
        <Link
          href={`/listings/${row.id}`}
          className={cn('rounded-sm font-medium text-ink hover:text-accent', FOCUS_RING)}
        >
          {row.publicRef}
        </Link>
        <span className="block max-w-xs text-xs text-ink-muted">{row.teaserTitle}</span>
        {row.rejectionReason === null ? null : (
          <span className="mt-1 block max-w-xs text-xs text-danger">
            {t('rejectionReason', { reason: row.rejectionReason })}
          </span>
        )}
      </Td>
      <Td>
        <StatusPill status={row.status} />
        {/* A published listing whose owner is not active is absent from the
            public catalog even though its own status says otherwise — the
            visibility floor requires both. Saying so here stops the console
            from contradicting what a visitor sees. */}
        {row.sellerUserStatus === 'ACTIVE' ? null : (
          <span className="mt-1 block text-xs text-warning">{t('ownerNotActive')}</span>
        )}
      </Td>
      <Td>
        <span className="text-ink-muted">{row.sellerCompanyName}</span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-ink-muted">{tAssets(`category.${row.category}`)}</span>
        <span className="block text-xs text-ink-muted">{row.country}</span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-ink-muted">
          {formatCents(row.askingPriceCents, locale)}
        </span>
        <span className="block text-xs text-ink-muted">
          {tAssets('card.views', { count: row.viewCount })}
        </span>
      </Td>
      <Td>
        <RowActions row={row} locale={locale} />
      </Td>
    </tr>
  )
}

/**
 * Which decisions this listing offers, mirroring `LISTING_TRANSITIONS`
 * (`@/server/queries/admin-where`): approve and reject only out of
 * `PENDING_REVIEW`, suspend only out of `PUBLISHED`. Every other status shows
 * nothing to press rather than a button that would come back `FORBIDDEN`.
 *
 * Approve carries a mandatory reason like the other two, which reads oddly
 * for a positive decision and is deliberate: design decision D4's audit trail
 * is only complete if it records *why a listing went live*, not merely why
 * one did not. The dialog's own copy asks for review notes rather than a
 * justification.
 */
function RowActions({ row, locale }: { row: AdminAssetRow; locale: string }) {
  const t = useTranslations('admin.assets')

  if (row.status === 'PENDING_REVIEW') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ModerationDialog
          triggerLabel={t('approve.trigger')}
          triggerVariant="primary"
          confirmVariant="primary"
          title={t('approve.title', { ref: row.publicRef })}
          consequence={t('approve.consequence')}
          confirmLabel={t('approve.confirm')}
          pendingLabel={t('approve.pending')}
          onConfirm={(reason) =>
            moderateListing({ assetId: row.id, decision: 'APPROVE', reason, locale })
          }
        />
        <ModerationDialog
          triggerLabel={t('reject.trigger')}
          title={t('reject.title', { ref: row.publicRef })}
          consequence={t('reject.consequence')}
          confirmLabel={t('reject.confirm')}
          pendingLabel={t('reject.pending')}
          onConfirm={(reason) =>
            moderateListing({ assetId: row.id, decision: 'REJECT', reason, locale })
          }
        />
      </div>
    )
  }

  if (row.status === 'PUBLISHED') {
    return (
      <ModerationDialog
        triggerLabel={t('suspend.trigger')}
        title={t('suspend.title', { ref: row.publicRef })}
        consequence={t('suspend.consequence')}
        confirmLabel={t('suspend.confirm')}
        pendingLabel={t('suspend.pending')}
        onConfirm={(reason) =>
          moderateListing({ assetId: row.id, decision: 'SUSPEND', reason, locale })
        }
      />
    )
  }

  return <span className="text-xs text-ink-muted">{t('actions.none')}</span>
}
