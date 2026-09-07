'use client'

import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/domain/status-pill'
import { ModerationDialog } from '@/components/domain/moderation-dialog'
import { reinstateUser, removeUser, suspendUser } from '@/server/actions/moderation'
import type { ParticipantRow } from '@/server/queries/admin'

/**
 * The console's participants tab: every account on the marketplace, with the
 * three account-level moderation actions on each row.
 *
 * A client component because the per-row buttons open `ModerationDialog` and
 * call the Server Actions directly — the same arrangement
 * `AccessRequestQueue` (`@/components/domain/access-request-queue`) uses for
 * approve/decline. The rows themselves are computed on the server by
 * `listParticipants` (`@/server/queries/admin`); nothing here fetches, and
 * only the row type crosses the boundary (`import type`, erased at compile
 * time, so no server module is pulled into the client bundle).
 *
 * **No row is wrapped in a `Link`.** Commit `970621a` fixed a `<button>`
 * nested inside an `<a>` in `buyer-card.tsx` that swallowed every click on
 * the control inside it, and a table row carrying per-row action buttons is
 * exactly that shape. There is no participant detail page to link to anyway,
 * so the cells are plain text and the only interactive elements are the
 * buttons themselves.
 */
export function ParticipantTable({
  rows,
  viewerUserId,
  locale,
}: {
  rows: ParticipantRow[]
  /** The signed-in manager, so their own row can say why it has no buttons. */
  viewerUserId: string
  /**
   * Passed down to every action call. A Server Action has no route params of
   * its own, so `locale` travels in its typed input — and it is validated
   * server-side by `toAppLocale` (`@/i18n/locale`) before it can reach a
   * `redirect()`, exactly as every other action in this app does.
   */
  locale: string
}) {
  const t = useTranslations('admin.participants')

  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {t('empty')}
      </p>
    )
  }

  return (
    // Wide content scrolls inside its own container rather than making the
    // page scroll horizontally.
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>{t('columns.account')}</Th>
            <Th>{t('columns.role')}</Th>
            <Th>{t('columns.status')}</Th>
            <Th>{t('columns.verified')}</Th>
            <Th>{t('columns.activity')}</Th>
            <Th>{t('columns.actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ParticipantRowView
              key={row.userId}
              row={row}
              isSelf={row.userId === viewerUserId}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="meta-label px-3 py-2 font-medium whitespace-nowrap">{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={className ?? 'px-3 py-3 align-top'}>{children}</td>
}

function ParticipantRowView({
  row,
  isSelf,
  locale,
}: {
  row: ParticipantRow
  isSelf: boolean
  locale: string
}) {
  const t = useTranslations('admin.participants')
  const tRole = useTranslations('admin.role')

  // The name a manager reads on screen and in the dialog: whichever profile
  // this account holds names it, and an account with neither (a manager) has
  // only its email.
  const label = row.displayName ?? row.email

  const activity: string[] = []
  if (row.activity.listingCount > 0) {
    activity.push(t('activity.listings', { count: row.activity.listingCount }))
  }
  // `publishedListingCount` is the `status: 'PUBLISHED'` half of the catalog's
  // visibility floor only; the other half is `sellerProfile.user.status ===
  // 'ACTIVE'` (`VISIBILITY_FLOOR`, `@/server/queries/asset-where`). So for an
  // account that is not itself active, "N in the catalog" is simply false —
  // and the assets tab on this same page already flags those very listings
  // "Owner not active, so hidden from the catalog", which is a contradiction
  // a manager can see in two clicks. The count is right and the sentence was
  // wrong, so the sentence changes: same number, qualified.
  //
  // The count is deliberately *not* zeroed for a suspended owner, because the
  // reinstate dialog below reads the same field to promise how many listings
  // come back — and there it is already correct, since reinstatement restores
  // the missing half of the floor.
  if (row.activity.publishedListingCount > 0) {
    activity.push(
      row.status === 'ACTIVE'
        ? t('activity.published', { count: row.activity.publishedListingCount })
        : t('activity.publishedHidden', { count: row.activity.publishedListingCount }),
    )
  }
  if (row.activity.requestCount > 0) {
    activity.push(t('activity.requests', { count: row.activity.requestCount }))
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <Td>
        <span className="block font-medium text-ink">{label}</span>
        {row.displayName === null ? null : (
          <span className="block text-xs text-ink-muted">{row.email}</span>
        )}
        {row.country === null ? null : (
          <span className="block text-xs text-ink-muted">{row.country}</span>
        )}
      </Td>
      <Td>
        <span className="whitespace-nowrap text-ink-muted">{tRole(row.role)}</span>
      </Td>
      <Td>
        <StatusPill status={row.status} />
      </Td>
      <Td>
        <span className="text-ink-muted">
          {row.verified === null
            ? t('verified.none')
            : row.verified
              ? t('verified.yes')
              : t('verified.no')}
        </span>
      </Td>
      <Td>
        <span className="text-ink-muted">
          {activity.length === 0 ? t('activity.none') : activity.join(' · ')}
        </span>
      </Td>
      <Td>
        <RowActions row={row} label={label} isSelf={isSelf} locale={locale} />
      </Td>
    </tr>
  )
}

/**
 * Which of the three account actions this row offers, derived from the same
 * `USER_TRANSITIONS` table (`@/server/queries/admin-where`) the Server
 * Actions enforce — expressed here as the statuses each button appears for,
 * so the console never offers a control that is guaranteed to come back
 * `FORBIDDEN`. That consistency between what is offered and what is allowed
 * is the same rule the catalog and the detail page keep between them.
 *
 * A manager's own row shows a sentence instead of buttons, and the Server
 * Action refuses it independently (`canModerateUser`, `@/lib/authz`). Hiding
 * the buttons is the courtesy; the predicate is the guarantee.
 */
function RowActions({
  row,
  label,
  isSelf,
  locale,
}: {
  row: ParticipantRow
  label: string
  isSelf: boolean
  locale: string
}) {
  const t = useTranslations('admin.participants')

  if (isSelf) {
    return <span className="text-xs text-ink-muted">{t('actions.self')}</span>
  }

  const published = row.activity.publishedListingCount

  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.status === 'ACTIVE' ? (
        <ModerationDialog
          triggerLabel={t('suspend.trigger')}
          title={t('suspend.title', { name: label })}
          consequence={t('suspend.consequence', { name: label, count: published })}
          confirmLabel={t('suspend.confirm')}
          pendingLabel={t('suspend.pending')}
          onConfirm={(reason) => suspendUser({ userId: row.userId, reason, locale })}
        />
      ) : null}

      {row.status === 'SUSPENDED' || row.status === 'REMOVED' ? (
        <ModerationDialog
          triggerLabel={t('reinstate.trigger')}
          title={t('reinstate.title', { name: label })}
          consequence={t('reinstate.consequence', { name: label, count: published })}
          confirmLabel={t('reinstate.confirm')}
          pendingLabel={t('reinstate.pending')}
          confirmVariant="primary"
          onConfirm={(reason) => reinstateUser({ userId: row.userId, reason, locale })}
        />
      ) : null}

      {row.status === 'ACTIVE' || row.status === 'SUSPENDED' ? (
        <ModerationDialog
          triggerLabel={t('remove.trigger')}
          title={t('remove.title', { name: label })}
          consequence={t('remove.consequence', { name: label })}
          confirmLabel={t('remove.confirm')}
          pendingLabel={t('remove.pending')}
          onConfirm={(reason) => removeUser({ userId: row.userId, reason, locale })}
        />
      ) : null}
    </div>
  )
}
