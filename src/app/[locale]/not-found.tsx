import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { buttonClassName } from '@/components/ui/button'

/**
 * The 404 every `notFound()` in this app lands on.
 *
 * Without this file Next.js serves its own bare page — no header, no locale, no
 * way back — and `notFound()` here is not an exceptional path. Twelve call
 * sites reach it as the *ordinary* outcome of an authorization rule: a listing
 * whose seller a manager has just suspended, a conversation the viewer is not a
 * party to, `/admin` for anyone who is not a manager, `/profile` for a viewer
 * holding no `BuyerProfile`. A 404 that is a routine product state has to look
 * like part of the product.
 *
 * It is a Server Component inside `[locale]/layout.tsx`, so it renders with the
 * site header and the viewer's own navigation already in place, and
 * `getTranslations()` resolves against the locale the middleware put in the
 * URL rather than a hardcoded one.
 *
 * The copy deliberately does not distinguish "does not exist" from "exists and
 * is not yours". Several queries collapse those two on purpose — `getAssetDetail`
 * and `getBuyerDetail` return `null` for both — so that holding an id cannot
 * confirm the row is there. The page must not undo that by naming which case it
 * is looking at.
 *
 * **A boundary is not a route**, which is why `[locale]/[...rest]/page.tsx`
 * sits next to this file. This catches `notFound()` thrown inside the
 * `[locale]` tree; a URL that matches no route never enters that tree and
 * would otherwise get Next's built-in page even with the locale already in
 * the path. The catch-all exists to turn "matched nothing" into a `notFound()`
 * raised in here. Its own doc comment covers why that beats the experimental
 * `app/global-not-found.tsx`.
 *
 * What is still left over is a request carrying a dot in its last segment
 * (`/foo.bar`): `src/proxy.ts`'s matcher excludes it as an asset, so it never
 * gets a locale prefix and falls to Next's built-in page. Reachable only by
 * typing one.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('notFound')

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-ink">{t('title')}</h1>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <p className="text-sm text-ink-muted">{t('body')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/listings" className={buttonClassName('primary')}>
              {t('backToListings')}
            </Link>
            <Link href="/" className={buttonClassName('secondary')}>
              {t('backHome')}
            </Link>
          </div>
        </CardBody>
      </Card>
    </main>
  )
}
