import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { RegisterForm } from '@/components/domain/register-form'
import { SIGN_IN_HREF } from '@/lib/nav'
import { getViewer, redirectNow } from '@/server/session'
import { FOCUS_RING, cn } from '@/lib/cn'

/**
 * Self-service sign-up, for the `BUYER` and `SELLER` roles only.
 *
 * A visitor who already holds a session is sent away before the form renders —
 * an active one to the app, a suspended one to `/suspended` — mirroring
 * `/login`, which makes the same decision for the same reason: creating a
 * second account from inside a first one leaves the browser authenticated as
 * whichever won, with nothing on screen saying which. `registerAccount`
 * (`@/server/actions/registration`) refuses the same case independently, so
 * this redirect is a convenience and not the guard.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  const viewer = await getViewer()
  if (viewer) redirectNow(viewer.status === 'ACTIVE' ? '/' : '/suspended', locale)

  const t = await getTranslations('register')

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      <Card>
        <CardBody>
          <RegisterForm locale={locale} />
        </CardBody>
      </Card>

      <p className="text-sm text-ink-muted">
        {t('haveAccount')}{' '}
        <Link href={SIGN_IN_HREF} className={cn('rounded-sm font-medium text-accent underline', FOCUS_RING)}>
          {t('signInLink')}
        </Link>
      </p>
    </main>
  )
}
