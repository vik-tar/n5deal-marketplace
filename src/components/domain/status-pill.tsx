import { useTranslations } from 'next-intl'
import type { AssetStatus, UserStatus } from '@/generated/prisma/client'
import { Badge, type BadgeTone } from '@/components/ui/badge'

/** Every status this pill can render — listing statuses and account statuses. */
export type PillStatus = AssetStatus | UserStatus

const tones: Record<PillStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'warning',
  SOLD: 'accent',
  ACTIVE: 'success',
  REMOVED: 'danger',
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
