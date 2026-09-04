import { getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { getViewer } from '@/server/session'
import { signInAction } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { DemoLogin } from './demo-login'

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { locale } = await params
  const { error } = await searchParams

  // Already signed in: an active viewer has nothing to do here, and a
  // suspended one belongs on `/suspended`, not back at the sign-in form.
  const viewer = await getViewer()
  if (viewer) redirect({ href: viewer.status === 'ACTIVE' ? '/' : '/suspended', locale })

  const t = await getTranslations('login')
  const boundSignIn = signInAction.bind(null, locale)

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

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
    </main>
  )
}
