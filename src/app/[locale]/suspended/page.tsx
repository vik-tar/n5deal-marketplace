import { getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { getViewer } from '@/server/session'
import { signOutAction } from '@/server/actions/auth'
import { prisma } from '@/server/db'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatusPill } from '@/components/domain/status-pill'

/**
 * `redirect()`'s declared return type is `never`, but that does not survive
 * far enough through `createNavigation`'s generics for `tsc` to treat a bare
 * call to it as unreachable — see the identical helper in `@/server/session`.
 */
function redirectNow(href: '/login' | '/', locale: string): never {
  redirect({ href, locale })
  throw new Error('unreachable: redirect() always throws')
}

export default async function SuspendedPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Not signed in at all: nothing to explain, go sign in. Signed in and
  // active: this screen is not for you, go to the app.
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
