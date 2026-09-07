'use server'

import { revalidatePath } from 'next/cache'
import { Prisma, type AssetStatus } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { requireViewer } from '@/server/session'
import { canEditAsset, canPublishListing, type AssetRef } from '@/lib/authz'
import { assetInputSchema, type AssetInput } from '@/lib/validation/asset'
import { nextPublicRef } from '@/lib/assets/public-ref'
import { reviewTeaser, type TeaserReview } from '@/lib/ai/teaser-review'
import type { ActionError, ActionResult } from './types'

/**
 * Every action below follows the same shape Task 14's `access-requests.ts`
 * documents: `requireViewer` first, then load the row the mutation targets
 * and build the `AssetRef` `@/lib/authz`'s predicates expect, then call the
 * matching predicate and bail out with `FORBIDDEN` before anything is
 * validated or written — never re-deriving `canEditAsset`/`canPublishListing`'s
 * rule inline. Authorization runs before zod validation, so an unauthorized
 * caller learns only `FORBIDDEN`, never `INVALID`.
 */

async function loadAssetRef(assetId: string): Promise<AssetRef | null> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      sellerProfileId: true,
      status: true,
      sellerProfile: { select: { user: { select: { status: true } } } },
    },
  })
  if (!asset) return null
  return {
    id: asset.id,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: asset.sellerProfile.user.status,
  }
}

// ---------------------------------------------------------------------------
// saveDraft
// ---------------------------------------------------------------------------

export interface SaveDraftInput extends AssetInput {
  /** Absent creates a new listing; present updates that seller's own asset. */
  assetId?: string
  locale: string
}

/**
 * `saveDraft`'s own result carries the id a create allocated and the status
 * the row ended up at — the shared `ActionResult` (`@/server/actions/types`)
 * has no room for either, and widening it would ripple into every other Task
 * 14-20 action, so this is a sibling type with the identical
 * `{ ok: true } | { ok: false; error }` shape instead. `status` is not
 * cosmetic: an edit to a `'PUBLISHED'` listing can silently pull it back to
 * `'PENDING_REVIEW'` (see the doc comment below), and `listing-form.tsx`
 * compares this against the status it started from to decide whether to
 * tell the seller their listing just came off the public catalog.
 */
export type SaveDraftResult =
  | { ok: true; assetId: string; status: AssetStatus }
  | { ok: false; error: ActionError }

/** Bounds the retry described in the doc comment on `saveDraft` below. */
const MAX_CREATE_ATTEMPTS = 5

function toAssetWrite(data: AssetInput) {
  return {
    category: data.category,
    licenceType: data.licenceType,
    businessType: data.businessType,
    country: data.country,
    regulator: data.regulator,
    businessStatus: data.businessStatus,
    askingPriceCents: BigInt(data.askingPriceCents),
    employees: data.employees,
    yearOfIssue: data.yearOfIssue,
    included: data.included,
    teaserTitle: data.teaserTitle,
    teaserDescription: data.teaserDescription,
    legalName: data.legalName,
    revenueCents: BigInt(data.revenueCents),
    ebitdaCents: BigInt(data.ebitdaCents),
    clientCount: data.clientCount,
    dataRoomUrl: data.dataRoomUrl ?? null,
    confidentialNotes: data.confidentialNotes,
  } satisfies Prisma.AssetUpdateInput
}

/**
 * Creates a listing as `'DRAFT'`, or updates an existing one in place.
 * `canPublishListing` gates a create (any active seller with a profile may
 * start one); `canEditAsset` gates an update of an existing asset (its
 * owner, and only while it is not `'SOLD'`) — the same pair of predicates
 * `runTeaserReview` and `submitForReview` below use, never re-derived here.
 *
 * **An edit to a `'PUBLISHED'` or a `'SUSPENDED'` listing pulls it back to
 * `'PENDING_REVIEW'`**: `canEditAsset` allows editing any non-`'SOLD'`
 * asset, and nothing before this stopped a seller from rewriting a live
 * listing's public teaser — including pasting back in the exact confidential
 * detail `runTeaserReview` exists to catch — with neither the AI check nor a
 * manager ever seeing the new text, since only the *first* publish went
 * through the moderation queue. Deliberately not clever about which fields
 * changed: a teaser-only edit to an otherwise-identical row still demotes
 * the listing, because a gate that only inspects the first version of a
 * document is not a gate. `'DRAFT'` and `'REJECTED'` are left untouched by
 * an edit (they are not live to begin with). `'PENDING_REVIEW'` is also left
 * untouched — it is already in the queue an edit would otherwise be trying
 * to re-enter, so re-writing the same status is a no-op, not a distinct
 * choice. `'SOLD'` never reaches this function at all (`canEditAsset`
 * refuses it above). This is why the update composes an explicit conditional
 * `status` rather than always carrying one: only a source status that
 * actually changes produces a `status` key.
 *
 * **`'SUSPENDED'` demotes for the same reason `'PUBLISHED'` does, and an
 * earlier version of this comment had it backwards.** It used to argue that
 * a suspension is a manager's call and that letting an edit move the listing
 * to `'PENDING_REVIEW'` would put the seller one step from public again, so
 * the status was left alone. That reasoning was written when nothing could
 * move a `SUSPENDED` listing at all; once `LISTING_TRANSITIONS`
 * (`@/server/queries/admin-where`) let `APPROVE` accept `SUSPENDED`, leaving
 * the status alone became the *worse* of the two options — a seller could
 * rewrite a suspended listing's teaser and a manager's restore would publish
 * that new text straight to `'PUBLISHED'`, past both the queue and
 * `runTeaserReview`, which is the exact hole the `'PUBLISHED'` demotion
 * exists to close. The invariant worth protecting is that no content reaches
 * `'PUBLISHED'` without a review pass. A seller fixing whatever got their
 * listing taken down is the normal path, not an attack — but it must land in
 * the queue rather than back in the catalog, and this is what puts it there.
 * The manager's `APPROVE` out of `'SUSPENDED'` remains the separate "I took
 * this down by mistake" path, which by definition involves no edited content;
 * either way the takedown stays in the moderation log. It also removes a
 * mismatch the edit page has carried since Task 15: the page offers "Submit
 * for review" on every editable listing, and `submitForReview` below refuses
 * a `'SUSPENDED'` source status — after this save the listing is
 * `'PENDING_REVIEW'`, which is exactly where that button was trying to go.
 *
 * `runTeaserReview` is **not** invoked from here, on this path or on the
 * `'PUBLISHED'` one — following what Task 15 established: the teaser check is
 * a button the seller presses (`listing-form.tsx`'s "Check teaser"), reading
 * the last *saved* row, never an implicit cost attached to saving. The
 * demotion is what guarantees a human sees the new text; the AI check
 * advises the seller before they get there and is disabled outright without
 * an API key, so making it load-bearing on a write path is precisely what
 * this codebase has refused to do since Task 9.
 *
 * `publicRef` allocation (ruling 2, Task 15): the next free `N5-<n>` is read
 * (via `nextPublicRef`) and the row inserted inside one `$transaction`, so the
 * read and the write are atomic from this function's own point of view. That
 * is not quite the same as collision-proof: two concurrent creates can each
 * open their own transaction, each read the same pre-collision maximum, and
 * each try to insert the same ref — Postgres's `@unique` constraint on
 * `publicRef` is what actually stops the second one, surfacing as Prisma
 * `P2002`. Rather than reporting that race to the seller as a failure of
 * *their* input (nothing about their input was wrong), this retries the whole
 * read-max-then-insert sequence, bounded at `MAX_CREATE_ATTEMPTS`: the retry's
 * fresh read happens only after the loser's transaction has rolled back and
 * the winner's has committed, so it is guaranteed to see the winner's row and
 * allocate the next number after it — the same reasoning `requestAccess`
 * (`@/server/actions/access-requests`) documents for why its own `P2002`
 * catch does not need a read-then-check race closed first. Exhausting every
 * attempt (near-impossible at this app's scale) is left to throw, same as
 * every other unhandled `PrismaClientKnownRequestError` in this codebase.
 */
export async function saveDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  const viewer = await requireViewer(input.locale)

  let ref: AssetRef | null = null
  if (input.assetId !== undefined) {
    ref = await loadAssetRef(input.assetId)
    if (!ref) return { ok: false, error: 'NOT_FOUND' }
    if (!canEditAsset(viewer, ref)) return { ok: false, error: 'FORBIDDEN' }
  } else if (!canPublishListing(viewer)) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const parsed = assetInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID' }
  const write = toAssetWrite(parsed.data)

  if (ref !== null) {
    // A `'PUBLISHED'` or a `'SUSPENDED'` source status demotes into the
    // review queue; the other three reachable statuses (`'DRAFT'`,
    // `'REJECTED'`, `'PENDING_REVIEW'`) are left exactly where they were —
    // see the doc comment above for why each is a deliberate no-op, not an
    // oversight.
    const nextStatus: AssetStatus =
      ref.status === 'PUBLISHED' || ref.status === 'SUSPENDED' ? 'PENDING_REVIEW' : ref.status

    // Conditioned on the *exact* status `canEditAsset` validated above (not
    // "not SOLD"), via `updateMany` rather than a read-then-write: an asset a
    // concurrent action already moved to any different status between that
    // check and this write — suspended by a manager, or raced by another
    // save — matches zero rows here instead of this write silently applying
    // (and, worse, silently computing `nextStatus` from a status that is no
    // longer true).
    const updated = await prisma.asset.updateMany({
      where: { id: ref.id, status: ref.status },
      data: nextStatus === ref.status ? write : { ...write, status: nextStatus },
    })
    if (updated.count === 0) return { ok: false, error: 'FORBIDDEN' }

    revalidatePath(`/${input.locale}/listings/${ref.id}`)
    revalidatePath(`/${input.locale}/listings/${ref.id}/edit`)
    // A demotion out of `'PUBLISHED'` must take the listing off the catalog
    // immediately, not just once its own cache entry next expires.
    if (nextStatus !== ref.status) revalidatePath(`/${input.locale}/listings`)
    return { ok: true, assetId: ref.id, status: nextStatus }
  }

  // `canPublishListing` requires a non-null `sellerProfileId` to return true,
  // so this is non-null on every path that reaches here.
  const sellerProfileId = viewer.sellerProfileId as string

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const rows = await tx.asset.findMany({ select: { publicRef: true } })
        const publicRef = nextPublicRef(rows.map((row) => row.publicRef))
        return tx.asset.create({
          data: { sellerProfileId, publicRef, status: 'DRAFT', ...write },
          select: { id: true },
        })
      })
      revalidatePath(`/${input.locale}/listings/${created.id}/edit`)
      return { ok: true, assetId: created.id, status: 'DRAFT' }
    } catch (error) {
      // `error.meta.target` — the usual way to name *which* unique column a
      // `P2002` violated — is not populated by Prisma 7's driver-adapter
      // errors (`@prisma/adapter-pg`): live testing this exact race (two
      // concurrent creates via real, simultaneous requests) surfaced
      // `meta: { driverAdapterError, modelName: 'Asset' }`, no `target` array
      // at all. Rather than a check that would silently never match, this
      // treats any `P2002` from this one `tx.asset.create` call as the
      // `publicRef` collision it must be: `Asset` has exactly one `@unique`
      // column besides its `cuid()` primary key (`publicRef`), so there is no
      // other constraint this specific call could be violating.
      const isRefCollision =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (!isRefCollision || attempt === MAX_CREATE_ATTEMPTS - 1) throw error
    }
  }
  // Unreachable: the loop above returns or throws on every iteration.
  throw new Error('unreachable: saveDraft create loop exhausted without returning or throwing')
}

// ---------------------------------------------------------------------------
// submitForReview
// ---------------------------------------------------------------------------

export interface SubmitForReviewInput {
  assetId: string
  locale: string
}

/**
 * Moves a listing from `'DRAFT'` or `'REJECTED'` to `'PENDING_REVIEW'` —
 * ruling 3 (Task 15). The transition rule itself is not re-derived here: the
 * write below is conditioned on exactly those two source statuses via
 * `updateMany`, mirroring `decideAccess`/`revokeAccess`
 * (`@/server/actions/access-requests`) — a concurrent call that already moved
 * this asset off `'DRAFT'`/`'REJECTED'` (a second submit racing the first, or
 * a manager acting on it in the same instant) matches zero rows and this
 * returns `FORBIDDEN` rather than racing an unconditional update.
 *
 * Clears `rejectionReason`: a listing re-submitted after a manager's earlier
 * rejection should not still show that stale reason once it is back under
 * review.
 */
export async function submitForReview(input: SubmitForReviewInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const ref = await loadAssetRef(input.assetId)
  if (!ref) return { ok: false, error: 'NOT_FOUND' }
  if (!canEditAsset(viewer, ref)) return { ok: false, error: 'FORBIDDEN' }

  const updated = await prisma.asset.updateMany({
    where: { id: ref.id, status: { in: ['DRAFT', 'REJECTED'] } },
    data: { status: 'PENDING_REVIEW', rejectionReason: null },
  })
  if (updated.count === 0) return { ok: false, error: 'FORBIDDEN' }

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
  revalidatePath(`/${input.locale}/listings/${ref.id}/edit`)
  revalidatePath(`/${input.locale}/listings`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// runTeaserReview
// ---------------------------------------------------------------------------

export interface RunTeaserReviewInput {
  assetId: string
  locale: string
}

/**
 * The one place in this project where AI guards the confidentiality
 * boundary rather than decorating the interface: it reads this listing's
 * *persisted* teaser and confidential fields (not whatever the client claims
 * they are) and asks `reviewTeaser` (`@/lib/ai/teaser-review`) whether the
 * teaser leaks the confidential half. Requires `canEditAsset` — only the
 * owning seller may spend a model call finding out what their own draft
 * leaks — but folds every failure into the same `null` a disabled AI client
 * already returns: an unauthorized caller, a missing asset, and "no key
 * configured" are indistinguishable from this function's outside, so calling
 * it never confirms whether a given `assetId` even exists to someone who may
 * not edit it, and it never throws (ruling 4, Task 15) — `requireViewer`'s
 * redirect for a signed-out caller is Next's own control-flow throw, the same
 * exception every other action in this app lets through, not an application
 * error this function itself raises.
 *
 * Reads the teaser and confidential fields straight off the database row,
 * not from the caller's arguments — so the review always reflects the
 * listing's last *saved* state. `listing-form.tsx`'s "Save draft" and "Check
 * teaser" are two separate button presses for exactly this reason: a seller
 * who edits the teaser and checks it without saving first is checking the
 * previous save, not the edit sitting unsaved in the form.
 */
export async function runTeaserReview(input: RunTeaserReviewInput): Promise<TeaserReview | null> {
  const viewer = await requireViewer(input.locale)

  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
    select: {
      id: true,
      sellerProfileId: true,
      status: true,
      sellerProfile: { select: { user: { select: { status: true } } } },
      teaserTitle: true,
      teaserDescription: true,
      legalName: true,
      revenueCents: true,
      ebitdaCents: true,
      clientCount: true,
    },
  })
  if (!asset) return null

  const ref: AssetRef = {
    id: asset.id,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: asset.sellerProfile.user.status,
  }
  if (!canEditAsset(viewer, ref)) return null

  return reviewTeaser({
    teaserTitle: asset.teaserTitle,
    teaserDescription: asset.teaserDescription,
    legalName: asset.legalName,
    revenueCents: Number(asset.revenueCents),
    ebitdaCents: Number(asset.ebitdaCents),
    clientCount: asset.clientCount,
  })
}
