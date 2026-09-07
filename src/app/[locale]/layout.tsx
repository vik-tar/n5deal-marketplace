import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/domain/site-header'
import { getViewer } from '@/server/session'
import { countUnreadMessages } from '@/server/queries/conversations'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const viewer = await getViewer()
  // Counted here rather than inside `SiteHeader` so that component stays
  // synchronous: it reads translations through `useTranslations`, which an
  // async Server Component may not use (next-intl's async surface is
  // `getTranslations`). This layout is already the one place that talks to the
  // database on behalf of the header, so the second read joins the first.
  const unreadCount = await countUnreadMessages(viewer)

  return (
    <html lang={locale} className="dark">
      <body className="antialiased">
        <NextIntlClientProvider>
          <div className="min-h-screen">
            <SiteHeader viewer={viewer} locale={locale} unreadCount={unreadCount} />
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
