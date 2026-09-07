'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button, buttonClassName } from '@/components/ui/button'

/**
 * The error boundary for everything under `[locale]`.
 *
 * Until this file existed the app had none, and it throws deliberately in
 * several places: `saveDraft` (`@/server/actions/assets`) rethrows any Prisma
 * error that is not the `publicRef` collision it retries, `sendMessage`'s
 * `$transaction` is unguarded, and `@/server/db` throws by design when
 * `DATABASE_URL` is missing. Without a boundary each of those reached Next's
 * built-in fallback — a bare "Application error" page with no header, no
 * locale and no way back.
 *
 * **Next 16 passes `retry`, not `reset`.** `retry()` re-fetches and re-renders
 * the boundary's children, which is what a transient failure actually needs;
 * `reset()` only clears the error state and re-renders the same already-failed
 * subtree. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 *
 * It does **not** cover `[locale]/layout.tsx` itself — an error boundary never
 * wraps the layout in its own segment — so a failure in `getViewer()` or in the
 * next-intl provider falls through to `app/global-error.tsx`, which is why that
 * file exists alongside this one.
 *
 * `error.message` is a generic string with a digest in production; Next
 * deliberately does not forward a Server Component's real message to the
 * client. Nothing here renders it — the digest goes to the console for matching
 * against the server log, and the user gets copy they can act on.
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations('errorBoundary')

  useEffect(() => {
    console.error('[error-boundary]', error.digest ?? '(no digest)', error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-ink">{t('title')}</h1>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <p role="alert" className="text-sm text-ink-muted">
            {t('body')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => retry()}>
              {t('retry')}
            </Button>
            <Link href="/" className={buttonClassName('secondary')}>
              {t('backHome')}
            </Link>
          </div>
        </CardBody>
      </Card>
    </main>
  )
}
