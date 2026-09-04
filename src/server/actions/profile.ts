'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/server/db'
import { requireViewer } from '@/server/session'
import { mandateSpecificity, scoreMatch, type AssetCriteria, type MandateCriteria } from '@/lib/matching'
import { VISIBILITY_FLOOR } from '@/server/queries/asset-where'
import {
  buyerProfileSchema,
  mandateSchema,
  type BuyerProfileInput,
  type MandateInput,
} from '@/lib/validation/profile'
import type { ActionError, ActionResult } from './types'

/**
 * Both actions below follow Task 14/15's shape: `requireViewer(locale)`
 * first, then a check before anything is validated or written. That check is
 * ruling 2 (Task 16), and it is a hard refusal, not a role check: **anyone**
 * whose `viewer.buyerProfileId` is `null` — a seller, a manager, even a
 * signed-in visitor whose account was somehow never given a buyer profile —
 * gets `FORBIDDEN`. Every write below is scoped to `viewer.buyerProfileId`
 * itself (never a caller-supplied id), so there is no separate "is this your
 * own profile" check to get wrong.
 */

// ---------------------------------------------------------------------------
// saveBuyerProfile
// ---------------------------------------------------------------------------

export interface SaveBuyerProfileInput extends BuyerProfileInput {
  locale: string
}

/**
 * The buyer's own identity, as a seller sees it once contacted or once
 * deciding an access request. Always an `update`, never an `upsert`: every
 * viewer with a non-null `buyerProfileId` has a real `BuyerProfile` row by
 * construction (`getViewer`, `@/server/session`, only sets that field from an
 * existing relation) — unlike the `Mandate` below, a `BuyerProfile` cannot be
 * legitimately missing here.
 */
export async function saveBuyerProfile(input: SaveBuyerProfileInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)
  if (viewer.buyerProfileId === null) return { ok: false, error: 'FORBIDDEN' }

  const parsed = buyerProfileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID' }
  const data = parsed.data

  await prisma.buyerProfile.update({
    where: { id: viewer.buyerProfileId },
    data: {
      displayName: data.displayName,
      buyerType: data.buyerType,
      country: data.country,
      bio: data.bio,
      websiteUrl: data.websiteUrl ?? null,
    },
  })

  revalidatePath(`/${input.locale}/profile`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// saveMandate
// ---------------------------------------------------------------------------

export interface SaveMandateInput extends MandateInput {
  locale: string
}

/**
 * Ruling 4 (Task 16): how many currently published listings this mandate
 * matches, and whether that count means anything at all. `specificity === 0`
 * is the vacuous case `@/lib/matching`'s own doc comment warns about — every
 * listing would score 100, so `matchCount` would equal `totalListings`
 * unconditionally and a consumer must not read that as "this mandate is a
 * perfect fit for the whole catalog".
 */
export interface MandateMatchSummary {
  matchCount: number
  totalListings: number
  specificity: number
}

/**
 * `saveMandate` cannot return the shared `ActionResult` (`./types`) alone —
 * ruling 4 requires the fresh match count on every successful save, and
 * widening `ActionResult` itself would ripple into every other Task 14-20
 * action that already destructures it. `SaveDraftResult` (`@/server/actions/assets`,
 * Task 15) sets the precedent for a sibling type with the identical tagged
 * shape instead.
 */
export type SaveMandateResult =
  | ({ ok: true } & MandateMatchSummary)
  | { ok: false; error: ActionError }

/**
 * Scores `mandate` against every currently published listing from an active
 * seller — the same `VISIBILITY_FLOOR` (`@/server/queries/asset-where`) the
 * public catalog itself enforces, not a re-derived approximation of it. With
 * ~34 published assets this app's own Task 18 brief accepts scoring every row
 * in memory as correct and simple; a real deployment would move this to a
 * filtered query plus a background-computed score, exactly as that brief
 * notes for its own `getRecommendedAssets`. `askingPriceCents` is converted
 * from `bigint` to `number` right here, at the read (ruling 5) — the only
 * place in this function a money column is touched.
 *
 * Exported (not just used internally by `saveMandate`) so the profile page's
 * own initial server render can show the identical summary before any save
 * has happened — not only immediately after one.
 */
export async function countMandateMatches(mandate: MandateCriteria): Promise<MandateMatchSummary> {
  const rows = await prisma.asset.findMany({
    where: VISIBILITY_FLOOR,
    select: {
      category: true,
      country: true,
      licenceType: true,
      businessStatus: true,
      askingPriceCents: true,
    },
  })

  let matchCount = 0
  for (const row of rows) {
    const criteria: AssetCriteria = {
      category: row.category,
      country: row.country,
      licenceType: row.licenceType,
      businessStatus: row.businessStatus,
      askingPriceCents: Number(row.askingPriceCents),
    }
    if (scoreMatch(mandate, criteria).band !== 'NONE') matchCount += 1
  }

  return { matchCount, totalListings: rows.length, specificity: mandateSpecificity(mandate) }
}

/**
 * Upserts on `buyerProfileId` (ruling 2): a buyer who never had a `Mandate`
 * row gets one on this first save, rather than this function requiring a
 * pre-existing row the way `saveBuyerProfile` above legitimately can.
 * `ticketMinCents`/`ticketMaxCents` are converted from `number` cents to
 * `bigint` right here, at the write (ruling 5) — the only two `BigInt(...)`
 * calls in this file.
 */
export async function saveMandate(input: SaveMandateInput): Promise<SaveMandateResult> {
  const viewer = await requireViewer(input.locale)
  if (viewer.buyerProfileId === null) return { ok: false, error: 'FORBIDDEN' }

  const parsed = mandateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID' }
  const data = parsed.data

  const write = {
    categories: data.categories,
    countries: data.countries,
    licenceTypes: data.licenceTypes,
    businessStatuses: data.businessStatuses,
    ticketMinCents: data.ticketMinCents === null ? null : BigInt(data.ticketMinCents),
    ticketMaxCents: data.ticketMaxCents === null ? null : BigInt(data.ticketMaxCents),
    timelineMonths: data.timelineMonths,
    notes: data.notes,
  }

  await prisma.mandate.upsert({
    where: { buyerProfileId: viewer.buyerProfileId },
    create: { buyerProfileId: viewer.buyerProfileId, ...write },
    update: write,
  })

  revalidatePath(`/${input.locale}/profile`)

  const criteria: MandateCriteria = {
    categories: data.categories,
    countries: data.countries,
    licenceTypes: data.licenceTypes,
    businessStatuses: data.businessStatuses,
    ticketMinCents: data.ticketMinCents,
    ticketMaxCents: data.ticketMaxCents,
  }
  const summary = await countMandateMatches(criteria)
  return { ok: true, ...summary }
}
