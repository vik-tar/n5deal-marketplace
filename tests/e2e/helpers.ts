import { execSync } from 'node:child_process'
import { expect, type Locator, type Page } from '@playwright/test'
import { ASSETS, type AssetFixture } from '../../prisma/seed-data/assets'
import {
  BUYERS,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  SELLERS,
  type BuyerFixture,
  type SellerFixture,
} from '../../prisma/seed-data/participants'

/**
 * Shared machinery for the three role flows. Everything here is deliberately
 * expressed as Playwright locators over roles, ids and data values — never as
 * a `page.content()` text search: `next-intl` serialises the whole message
 * namespace a page uses into the RSC flight payload, so a raw-HTML grep for
 * "Confidential details" finds it whether or not the block rendered. The
 * assertion that matters most in this suite ("the confidential block is
 * absent") is exactly the one that trap eats.
 */

export type DemoRole = keyof typeof DEMO_ACCOUNTS

/**
 * Every navigation in this suite is English-prefixed. The specs read visible
 * button and heading text, which is locale-dependent; pinning the locale is
 * what makes that legitimate rather than fragile.
 */
export const EN = '/en' as const

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

/**
 * Puts the development database back into exactly the state `pnpm db:seed`
 * produces: 19 users, 40 assets, 7 access requests, 4 conversations, 2
 * moderation log rows.
 *
 * **`prisma db seed` alone, not `prisma migrate reset --force && prisma db
 * seed`.** The plan and the task brief both name the latter, and this is a
 * deliberate departure with two reasons, either of which is sufficient:
 *
 * 1. **It is not needed.** `prisma/seed.ts` opens by deleting every one of
 *    the schema's ten models in reverse dependency order before it writes
 *    anything, so the seed *is* a complete data reset. All `migrate reset`
 *    adds is dropping and recreating the schema and replaying the migrations
 *    — which changes nothing unless the schema has drifted, and if it has,
 *    `pnpm db:migrate` is the command that says so rather than a test suite
 *    silently repairing it.
 * 2. **Prisma 7.10 refuses it outright when an AI agent invokes it.** The CLI
 *    detects the agent harness and exits non-zero on `migrate reset` unless
 *    `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` carries the user's own
 *    words of consent. Nothing here is entitled to supply that, so a suite
 *    built on `db:reset` could not be run — or shown to fail for the right
 *    reason — by the agent writing it.
 *
 * A test suite that drops a developer's schema on startup is also a larger
 * promise than "the demo data is back where the seed put it", which is all
 * these three specs actually need.
 *
 * `execSync` with no `cwd` inherits the working directory `pnpm test:e2e`
 * started in, which pnpm guarantees is the package root.
 */
export function resetDb(): void {
  execSync('pnpm db:seed', { stdio: 'inherit' })
}

/**
 * The same operation, named for the other end of the run. `globalTeardown`
 * calls it so a completed run leaves the demo data exactly as the seed
 * produces it — the suite creates a listing, files an access request and
 * moves account statuses, and the next `pnpm dev` should not inherit any of
 * it.
 */
export function seedDb(): void {
  resetDb()
}

// ---------------------------------------------------------------------------
// Seed fixtures
// ---------------------------------------------------------------------------

/**
 * The seeded listing with this id, read from the same fixture module
 * `prisma/seed.ts` writes from — so a spec can assert on a real `legalName`
 * or `teaserTitle` without hardcoding a string that the fixture generator
 * could change underneath it.
 */
export function assetFixture(id: string): AssetFixture {
  const asset = ASSETS.find((candidate) => candidate.id === id)
  if (!asset) throw new Error(`No seeded asset fixture with id ${id}`)
  return asset
}

/** The seeded buyer with this email, for the `displayName` a seller's queue shows. */
export function buyerFixture(email: string): BuyerFixture {
  const buyer = BUYERS.find((candidate) => candidate.email === email)
  if (!buyer) throw new Error(`No seeded buyer fixture with email ${email}`)
  return buyer
}

/** The seeded seller with this email, for the `companyName` the NDA gate withholds. */
export function sellerFixture(email: string): SellerFixture {
  const seller = SELLERS.find((candidate) => candidate.email === email)
  if (!seller) throw new Error(`No seeded seller fixture with email ${email}`)
  return seller
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * The header's only `<form>` is the sign-out form (`site-header.tsx`); the
 * locale switcher beside it is two links. So its presence *is* the signed-in
 * state, with no message key involved.
 */
function signOutButton(page: Page): Locator {
  return page.locator('header form button')
}

/** The header's sign-in link, present exactly when no session is attached. */
function signInLink(page: Page): Locator {
  return page.locator(`header a[href="${EN}/login"]`)
}

/**
 * Signs in through the demo button for `role`.
 *
 * The button is found by the credentials its own hidden inputs carry rather
 * than by its label: `demo-login.tsx` renders one `<form>` per role holding
 * `email` and `password` as hidden fields, so filtering on both values names
 * exactly one form and simultaneously asserts that the seeded account this
 * suite expects is the one the page offers.
 *
 * `/en/login` bounces a signed-in viewer straight back out, so an existing
 * session is cleared first — that is what lets a spec hand the browser from
 * one role to the next without an explicit sign-out between every hop.
 */
export async function signInAs(page: Page, role: DemoRole): Promise<void> {
  await page.goto(`${EN}/login`)
  if ((await signOutButton(page).count()) > 0) {
    await signOut(page)
    await page.goto(`${EN}/login`)
  }

  const email = DEMO_ACCOUNTS[role]
  const form = page
    .locator('form')
    .filter({ has: page.locator(`input[name="email"][value="${email}"]`) })
    .filter({ has: page.locator(`input[name="password"][value="${DEMO_PASSWORD}"]`) })
  await expect(form).toHaveCount(1)
  await form.getByRole('button').click()

  // The signed-in header prints the viewer's own email — a data value, not a
  // translated string — so this waits on the session *and* on it being the
  // right account.
  await expect(page.locator('header').getByText(email, { exact: true })).toBeVisible()
}

/** Ends the session and waits for the header to offer sign-in again. */
export async function signOut(page: Page): Promise<void> {
  await signOutButton(page).click()
  await expect(signInLink(page)).toBeVisible()
}

/** Asserts no session is attached to this browser context. */
export async function expectAnonymous(page: Page): Promise<void> {
  await expect(signInLink(page)).toBeVisible()
  await expect(signOutButton(page)).toHaveCount(0)
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The listing cards on `/en/listings`.
 *
 * `AssetCard` is a `<Link>` to `/en/listings/<id>` wrapped in an `<li>`. The
 * filter chips and the pagination controls are also `<li>`-wrapped links, but
 * they point at `/en/listings?…` — the character after `listings` is `?`, not
 * `/` — so this prefix selector separates results from controls without
 * relying on any class name.
 */
export function listingCards(page: Page): Locator {
  return page.locator(`li > a[href^="${EN}/listings/"]`)
}

/**
 * Each visible card's category, as rendered.
 *
 * `AssetCard` puts the category first in its `.meta-label` fact row; the
 * card's other two `.meta-label` elements ("Included in the sale", "Asking
 * price") contain no child `<span>` at all, so `> span:first-child` resolves
 * to exactly one element per card.
 */
export function listingCardCategories(page: Page): Locator {
  return page.locator(`li > a[href^="${EN}/listings/"] .meta-label > span:first-child`)
}

/**
 * `/en/listings` filtered to one listing by its public reference.
 *
 * `buildWhere` (`@/server/queries/asset-where`) matches `q` against
 * `publicRef` among other columns, which turns "is this listing in the public
 * catalog?" into a single-page question — the catalog paginates at 12 and the
 * seed publishes 34, so scanning for a reference without a filter would be a
 * pagination test, not a visibility test.
 */
export async function gotoCatalogFilteredTo(page: Page, publicRef: string): Promise<void> {
  await page.goto(`${EN}/listings?q=${encodeURIComponent(publicRef)}`)
}

// ---------------------------------------------------------------------------
// Moderation console
// ---------------------------------------------------------------------------

/**
 * Fills and confirms the open `ModerationDialog`.
 *
 * The dialog is a native `<dialog>` opened with `showModal()`, so exactly one
 * carries the `open` attribute at a time however many rows rendered one. Its
 * textarea id comes from `useId()` and is therefore not addressable; scoping
 * to `dialog[open]` is.
 *
 * The confirm button is asserted enabled before it is clicked. That is not
 * ceremony: `ModerationDialog` derives `disabled` from
 * `isValidModerationReason`, so a reason under ten characters would leave the
 * click waiting for actionability and time out with no indication that the
 * *reason* was the problem. Asserting the state first names the cause.
 */
export async function confirmModerationDialog(
  page: Page,
  reason: string,
  confirmLabel: string,
): Promise<void> {
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toHaveCount(1)
  await dialog.locator('textarea').fill(reason)
  const confirm = dialog.getByRole('button', { name: confirmLabel })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  // The dialog closes only on `result.ok` (see `moderation-dialog.tsx`), so
  // its disappearance is the action's success, not merely the click landing.
  await expect(page.locator('dialog[open]')).toHaveCount(0)
}
