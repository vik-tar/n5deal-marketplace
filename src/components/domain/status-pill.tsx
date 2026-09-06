import { useTranslations } from 'next-intl'
import type { AccessStatus, AssetStatus, UserStatus } from '@/generated/prisma/client'
import { Badge, type BadgeTone } from '@/components/ui/badge'

/**
 * Every status this pill can render — listing statuses, account statuses and,
 * since Task 18's dashboards, access-request statuses.
 *
 * The three enums are unioned rather than given three components because
 * their members are disjoint (`AccessStatus`'s `REQUESTED`/`APPROVED`/
 * `DECLINED`/`REVOKED` collide with nothing in `AssetStatus` or `UserStatus`),
 * so one tone map and one flat `status` message namespace stay unambiguous.
 *
 * Nothing here would *catch* a future collision, and it is worth being
 * explicit about that rather than implying a guard that does not exist: a
 * union collapses duplicate members, so a new `AssetStatus.APPROVED` would
 * silently share `AccessStatus.APPROVED`'s single `tones` entry and single
 * `status.APPROVED` label with no type error at all. `SUSPENDED` already
 * demonstrates the mechanic — `AssetStatus` and `UserStatus` both have it and
 * it is deliberately one shared tone and one shared word. A collision that
 * needed to read differently would mean turning this union into a
 * discriminated prop, and the only thing that would surface it is someone
 * noticing the wrong word on screen.
 */
export type PillStatus = AssetStatus | UserStatus | AccessStatus

const tones: Record<PillStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'warning',
  SOLD: 'accent',
  ACTIVE: 'success',
  REMOVED: 'danger',
  // An ask still waiting on the seller reads as "in progress", the same
  // warning tone `PENDING_REVIEW` uses for a listing waiting on a manager.
  REQUESTED: 'warning',
  APPROVED: 'success',
  DECLINED: 'danger',
  // Neutral, not danger: a revoked grant is a grant that ended, not a
  // rejection of the buyer, and the buyer's dashboard lists it as history.
  REVOKED: 'neutral',
}

/** Label text comes from the `status` message namespace, keyed by enum value. */
export function StatusPill({
  status,
  className,
}: {
  status: PillStatus
  className?: string
}) {
  const t = useTranslations('status')
  return (
    <Badge tone={tones[status]} className={className}>
      {t(status)}
    </Badge>
  )
}
