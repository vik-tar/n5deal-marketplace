import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ListingForm, type ListingFormInitial } from '@/components/domain/listing-form'
import { requireViewer } from '@/server/session'
import { canEditAsset, type AssetRef } from '@/lib/authz'
import { isAiEnabled } from '@/lib/ai/client'
import { prisma } from '@/server/db'

/**
 * Loads exactly the fields `ListingFormInitial` needs — not `getAssetDetail`'s
 * `AssetDto` (`@/server/queries/assets`), which is shaped for the *public*
 * detail page and would still redact the confidential half for anyone short
 * of an approved grant. The owning seller editing their own draft always
 * sees every field, gated here by `canEditAsset` alone, and each `bigint`
 * money column is converted to `number` right here — before `initial` is
 * ever handed to the client component `ListingForm` — the same rule ruling 1
 * states and `@/lib/dto/asset` already follows for the public detail page.
 *
 * A listing that exists but is not this viewer's to edit (someone else's
 * listing, or their own asset once it is `'SOLD'`) renders exactly the same
 * 404 as one that does not exist at all — never a 403 that would confirm a
 * hidden row is there, mirroring `getAssetDetail`'s own reasoning.
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const viewer = await requireViewer(locale)

  const row = await prisma.asset.findUnique({
    where: { id },
    select: {
      id: true,
      sellerProfileId: true,
      status: true,
      publicRef: true,
      rejectionReason: true,
      sellerProfile: { select: { user: { select: { status: true } } } },
      category: true,
      licenceType: true,
      businessType: true,
      country: true,
      regulator: true,
      businessStatus: true,
      askingPriceCents: true,
      employees: true,
      yearOfIssue: true,
      included: true,
      teaserTitle: true,
      teaserDescription: true,
      legalName: true,
      revenueCents: true,
      ebitdaCents: true,
      clientCount: true,
      dataRoomUrl: true,
      confidentialNotes: true,
    },
  })
  if (!row) notFound()

  const ref: AssetRef = {
    id: row.id,
    sellerProfileId: row.sellerProfileId,
    status: row.status,
    ownerStatus: row.sellerProfile.user.status,
  }
  if (!canEditAsset(viewer, ref)) notFound()

  const t = await getTranslations('listingForm')

  const initial: ListingFormInitial = {
    assetId: row.id,
    publicRef: row.publicRef,
    status: row.status,
    rejectionReason: row.rejectionReason,
    category: row.category,
    licenceType: row.licenceType,
    businessType: row.businessType,
    country: row.country,
    regulator: row.regulator,
    businessStatus: row.businessStatus,
    askingPriceCents: Number(row.askingPriceCents),
    employees: row.employees,
    yearOfIssue: row.yearOfIssue,
    included: row.included,
    teaserTitle: row.teaserTitle,
    teaserDescription: row.teaserDescription,
    legalName: row.legalName,
    revenueCents: Number(row.revenueCents),
    ebitdaCents: Number(row.ebitdaCents),
    clientCount: row.clientCount,
    dataRoomUrl: row.dataRoomUrl ?? undefined,
    confidentialNotes: row.confidentialNotes,
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('editTitle', { ref: row.publicRef })}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('editSubtitle')}</p>
      </div>
      <ListingForm locale={locale} aiEnabled={isAiEnabled()} initial={initial} />
    </main>
  )
}
