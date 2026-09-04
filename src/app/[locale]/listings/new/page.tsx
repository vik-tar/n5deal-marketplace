import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ListingForm } from '@/components/domain/listing-form'
import { requireViewer } from '@/server/session'
import { canPublishListing } from '@/lib/authz'
import { isAiEnabled } from '@/lib/ai/client'

/**
 * `requireViewer` handles the two authentication-shaped denials (redirect to
 * `/login` or `/suspended`) the same way every Server Action in this app
 * already does. `canPublishListing` is a role/profile check on top of that —
 * a signed-in buyer or manager has no listing to create — and a failure
 * there renders a 404, not a 403: the same "hidden and non-existent look
 * identical" choice `getAssetDetail` (`@/server/queries/assets`) documents
 * for a listing this viewer may not see.
 */
export default async function NewListingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const viewer = await requireViewer(locale)
  if (!canPublishListing(viewer)) notFound()

  const t = await getTranslations('listingForm')

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('newTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('newSubtitle')}</p>
      </div>
      <ListingForm locale={locale} aiEnabled={isAiEnabled()} />
    </main>
  )
}
