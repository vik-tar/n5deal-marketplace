import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/domain/site-header'
import { getViewer } from '@/server/session'
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

  return (
    <html lang={locale} className="dark">
      <body className="antialiased">
        <NextIntlClientProvider>
          <div className="min-h-screen">
            <SiteHeader viewer={viewer} locale={locale} />
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
