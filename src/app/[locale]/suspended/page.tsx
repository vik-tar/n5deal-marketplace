import { getTranslations } from 'next-intl/server'
import { getViewer, redirectNow } from '@/server/session'
import { signOutAction } from '@/server/actions/auth'
import { prisma } from '@/server/db'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusPill } from '@/components/domain/status-pill'

export default async function SuspendedPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Not signed in at all: nothing to explain, go sign in. Signed in and
  // active: this screen is not for you, go to the app.
  //
  // Both redirects go through the shared `redirectNow` (`@/server/session`)
  // since Task 20. This page used to carry its own copy, written before that
  // one was exported, and the copy passed `locale` straight to `redirect()`
  // — which the shared version stopped doing when `toAppLocale`
  // (`@/i18n/locale`) landed. It was not exploitable here (this `locale` is
  // the route segment, and `src/app/[locale]/layout.tsx` `notFound()`s on
  // anything that is not a configured locale before this page renders), but a
  // second copy of a security-relevant helper is a second place to forget the
  // rule, which is exactly how `auth.ts` was missed once already.
  const viewer = await getViewer()
  if (!viewer) redirectNow('/login', locale)
  if (viewer.status === 'ACTIVE') redirectNow('/', locale)

  const log = await prisma.moderationLog.findFirst({
    where: { targetType: 'USER', targetId: viewer.userId },
    orderBy: { createdAt: 'desc' },
  })

  const t = await getTranslations()
  const boundSignOut = signOutAction.bind(null, locale)

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-ink">{t('suspended.title')}</h1>
          <StatusPill status={viewer.status} />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* `suspended.body` used to say "you cannot access listings", which
              is not true and never was: `/listings` and every teaser stay open
              to a suspended viewer, exactly as they are to an anonymous one
              (`statusAllowsAuthenticatedSurfaces`, `@/lib/authz`, and Task 13's
              widening of `canViewAsset`). Corrected in Task 20 alongside that
              predicate's rename — measured first: a suspended seller's session
              answers 200 on `/en/listings` and on a listing detail page. */}
          <p className="text-sm text-ink-muted">{t('suspended.body')}</p>

          <div>
            <p className="meta-label">{t('suspended.reasonLabel')}</p>
            <p className="text-sm text-ink">{log?.reason ?? t('suspended.noReason')}</p>
          </div>

          <form action={boundSignOut}>
            <Button type="submit" variant="secondary">
              {t('common.signOut')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}
