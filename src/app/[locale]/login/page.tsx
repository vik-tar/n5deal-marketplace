import { getTranslations } from 'next-intl/server'
import { getViewer, redirectNow } from '@/server/session'
import { signInAction } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { DemoLogin } from './demo-login'
import { Link } from '@/i18n/navigation'
import { FOCUS_RING, cn } from '@/lib/cn'

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; registered?: string }>
}) {
  const { locale } = await params
  const { error, registered } = await searchParams

  // Already signed in: an active viewer has nothing to do here, and a
  // suspended one belongs on `/suspended`, not back at the sign-in form.
  //
  // Through `redirectNow` (`@/server/session`) for consistency with
  // `/suspended`, not as a fix. The open-redirect hypothesis was tested
  // against this line and **refuted**: `[locale]` is a route segment the
  // router has already matched against the configured locales, so a crafted
  // value 404s before this page runs. What the shared helper buys is that no
  // future edit here has to know that.
  const viewer = await getViewer()
  if (viewer) redirectNow(viewer.status === 'ACTIVE' ? '/' : '/suspended', locale)

  const t = await getTranslations('login')
  const boundSignIn = signInAction.bind(null, locale)

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      {registered ? (
        <p role="status" className="text-sm text-success">
          {t('registeredNotice')}
        </p>
      ) : null}

      <Card>
        <CardBody>
          <form action={boundSignIn} className="flex flex-col gap-4">
            <Field label={t('emailLabel')} htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="field-control"
              />
            </Field>
            <Field label={t('passwordLabel')} htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="field-control"
              />
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {t('error')}
              </p>
            ) : null}
            <Button type="submit">{t('submit')}</Button>
          </form>
        </CardBody>
      </Card>

      <DemoLogin locale={locale} />

      <p className="text-sm text-ink-muted">
        {t('noAccount')}{' '}
        <Link
          href="/register"
          className={cn('rounded-sm font-medium text-accent underline', FOCUS_RING)}
        >
          {t('registerLink')}
        </Link>
      </p>
    </main>
  )
}
