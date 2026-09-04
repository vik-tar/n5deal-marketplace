import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SiteHeader } from '@/components/domain/site-header'
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

  return (
    <html lang={locale} className="dark">
      <body className="antialiased">
        <NextIntlClientProvider>
          <div className="min-h-screen">
            {/* Task 11 replaces `null` with the real session viewer. */}
            <SiteHeader viewer={null} />
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
