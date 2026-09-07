import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  MandateForm,
  type MandateFormInitialMandate,
  type MandateFormInitialProfile,
} from '@/components/domain/mandate-form'
import { requireViewer } from '@/server/session'
import { prisma } from '@/server/db'
import { countMandateMatches } from '@/server/actions/profile'
import type { MandateCriteria } from '@/lib/matching'
import { MANDATE_LICENCE_TYPES } from '@/lib/filters/buyer-filters'
import { keepKnown } from '@/lib/filters/shared'

/**
 * The buyer's own profile-and-mandate editor. `viewer.buyerProfileId === null`
 * (a seller or a manager) renders a 404, not a 403 — the same "hidden and
 * non-existent look identical" choice `@/app/[locale]/listings/new/page.tsx`
 * documents for `canPublishListing`.
 *
 * `Mandate` is loaded separately from `BuyerProfile` because it may
 * legitimately be `null` (ruling 2, Task 16: a buyer who never saved one gets
 * a row only on their first `saveMandate`) — every array/bound below falls
 * back to the "any preference" shape in that case. Every `bigint` money
 * column is converted to `number` right here, before `MandateFormInitialMandate`
 * is ever handed to the client component (ruling 5), exactly as the Task 15
 * edit page already does for a listing's own money columns.
 *
 * `countMandateMatches` runs once here, server-side, so the page's very first
 * render already shows the real "matches N of M" summary (or the
 * "constrains nothing" notice) — not just after the buyer's first save. It is
 * a Server Action and it re-runs `requireViewer` and the `buyerProfileId`
 * check this page has already run: that duplication is the point, since the
 * action is a network endpoint that anyone can POST to and must not be
 * safe only because of who reaches this page. Its `{ ok: false }` branch is
 * therefore unreachable from here — the two guards above decided the same
 * thing — and is answered with the same 404 the `buyerProfileId` guard uses
 * rather than an error state the page cannot explain.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const viewer = await requireViewer(locale)
  if (viewer.buyerProfileId === null) notFound()

  const buyerProfile = await prisma.buyerProfile.findUnique({
    where: { id: viewer.buyerProfileId },
    select: {
      displayName: true,
      buyerType: true,
      country: true,
      bio: true,
      websiteUrl: true,
      mandate: {
        select: {
          categories: true,
          countries: true,
          licenceTypes: true,
          businessStatuses: true,
          ticketMinCents: true,
          ticketMaxCents: true,
          timelineMonths: true,
          notes: true,
        },
      },
    },
  })
  // `viewer.buyerProfileId` is read straight off the `BuyerProfile` relation
  // in `getViewer` (`@/server/session`), so a live row is guaranteed here —
  // this is defensive, not a reachable branch.
  if (!buyerProfile) notFound()

  const profile: MandateFormInitialProfile = {
    displayName: buyerProfile.displayName,
    buyerType: buyerProfile.buyerType,
    country: buyerProfile.country,
    bio: buyerProfile.bio,
    websiteUrl: buyerProfile.websiteUrl ?? undefined,
  }

  const mandate: MandateFormInitialMandate = {
    categories: buyerProfile.mandate?.categories ?? [],
    countries: buyerProfile.mandate?.countries ?? [],
    // `Mandate.licenceTypes` is a plain `String[]` column (no Prisma enum to
    // lean on) — filtered through the same fixed universe the write side
    // validates against, so a stray legacy value in the database cannot
    // reach the client typed as a member of `MANDATE_LICENCE_TYPES` when it
    // is not one.
    licenceTypes: keepKnown(buyerProfile.mandate?.licenceTypes ?? [], MANDATE_LICENCE_TYPES),
    businessStatuses: buyerProfile.mandate?.businessStatuses ?? [],
    ticketMinCents:
      buyerProfile.mandate?.ticketMinCents != null
        ? Number(buyerProfile.mandate.ticketMinCents)
        : null,
    ticketMaxCents:
      buyerProfile.mandate?.ticketMaxCents != null
        ? Number(buyerProfile.mandate.ticketMaxCents)
        : null,
    timelineMonths: buyerProfile.mandate?.timelineMonths ?? null,
    notes: buyerProfile.mandate?.notes ?? '',
  }

  const criteria: MandateCriteria = {
    categories: mandate.categories,
    countries: mandate.countries,
    licenceTypes: mandate.licenceTypes,
    businessStatuses: mandate.businessStatuses,
    ticketMinCents: mandate.ticketMinCents,
    ticketMaxCents: mandate.ticketMaxCents,
  }
  const match = await countMandateMatches({ mandate: criteria, locale })
  if (!match.ok) notFound()

  const t = await getTranslations('profile')

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('pageSubtitle')}</p>
      </div>
      <MandateForm profile={profile} mandate={mandate} match={match} locale={locale} />
    </main>
  )
}
