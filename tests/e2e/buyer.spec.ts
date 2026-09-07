import { expect, test } from '@playwright/test'
import { DEMO_ACCOUNTS } from '../../prisma/seed-data/participants'
import {
  EN,
  assetFixture,
  buyerFixture,
  listingCardCategories,
  listingCards,
  sellerFixture,
  signInAs,
} from './helpers'

/**
 * The buyer flow: filtering the catalog, and the NDA gate opening.
 *
 * **The gate half is the reason this spec exists.** The confidential fields
 * are not rendered-and-hidden — `getAssetDetail` never puts them on the DTO
 * unless `canViewFullAsset` holds — so proving the block is absent means
 * proving a *value* is absent, not that some CSS hid it. That is also why
 * every assertion below is a locator rather than a search of `page.content()`:
 * `next-intl` ships the whole `gate` namespace into the RSC flight payload,
 * so the raw HTML of a *closed* gate contains the string "Confidential
 * details" regardless. A grep would pass in both directions and prove
 * nothing.
 *
 * The strongest absence checks are the two data ones — the listing's
 * `legalName` and the seller's `companyName`. Both are seeded values, neither
 * appears in any message file, and neither can reach the DOM except by the
 * gate actually opening.
 */

/**
 * `asset-711`: `PUBLISHED`, owned by `seller@n5deal.demo` (the one seller with
 * a demo button), and the seed files no access request against it — so the
 * demo buyer starts with `GrantState` `'NONE'` on it and one browser can play
 * both sides of the gate. `prisma/seed.ts` touches 701-706 and 710; this is
 * the first of the demo seller's published listings it leaves alone.
 */
const GATED_ASSET_ID = 'asset-711'

/** The `assets.category.EMI` label, as `/en` renders it. */
const EMI_LABEL = 'E-money institution'

test('a buyer filters by category, then opens the NDA gate on a listing', async ({ page }) => {
  const asset = assetFixture(GATED_ASSET_ID)
  const buyer = buyerFixture(DEMO_ACCOUNTS.buyer)
  const seller = sellerFixture(DEMO_ACCOUNTS.seller)

  const confidentialHeading = page.getByRole('heading', {
    name: 'Confidential details',
    exact: true,
  })
  const legalName = page.getByText(asset.legalName, { exact: false })
  const sellerName = page.getByText(seller.companyName, { exact: false })

  await signInAs(page, 'buyer')

  // --- The category filter -------------------------------------------------
  await page.goto(`${EN}/listings`)
  await page.locator('label').filter({ hasText: EMI_LABEL }).getByRole('checkbox').click()

  // The whole filter state lives in the URL — that is what makes a filtered
  // catalog shareable, and it is what `FilterSidebar` navigates to rather
  // than holding in component state.
  await expect(page).toHaveURL(/categories=EMI/)

  // Three retrying assertions rather than one snapshot of `count()`: the
  // sidebar navigates client-side, so a single `count()` taken too early
  // reads the unfiltered page. Together they say "there is at least one
  // result, none of them is anything but EMI, and those categories account
  // for every card on the page" — the third is what stops the second from
  // passing vacuously if the category cell selector ever stopped matching.
  const categories = listingCardCategories(page)
  await expect(categories).not.toHaveCount(0)
  await expect(categories.filter({ hasNotText: EMI_LABEL })).toHaveCount(0)
  await expect(listingCards(page)).toHaveCount(await categories.count())

  // --- The gate is closed --------------------------------------------------
  await page.goto(`${EN}/listings/${GATED_ASSET_ID}`)
  // Present, so this is the real listing page and not a 404 that would make
  // every absence check below pass for the wrong reason.
  await expect(page.getByRole('heading', { name: asset.teaserTitle })).toBeVisible()

  await expect(confidentialHeading).toHaveCount(0)
  await expect(legalName).toHaveCount(0)
  await expect(sellerName).toHaveCount(0)

  // --- The buyer requests access -------------------------------------------
  await page
    .locator('#access-request-message')
    .fill('Meridian is reviewing EU e-money assets and would like the confidential pack.')
  await page.getByRole('button', { name: 'Request access' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is with the seller' })).toBeVisible()
  // Still closed while it is only pending — the state change that matters is
  // the seller's decision, not the buyer's ask.
  await expect(confidentialHeading).toHaveCount(0)
  await expect(legalName).toHaveCount(0)

  // --- The seller approves it ----------------------------------------------
  await signInAs(page, 'seller')
  await page.goto(`${EN}/listings/${GATED_ASSET_ID}`)

  const pendingRow = page
    .getByRole('listitem')
    .filter({ hasText: buyer.displayName })
    .filter({ has: page.getByRole('button', { name: 'Approve' }) })
  await expect(pendingRow).toHaveCount(1)
  await pendingRow.getByRole('button', { name: 'Approve' }).click()
  // The row moves from "Pending requests" to "Approved buyers", where the only
  // control is "Revoke access" — so this waits on the decision landing, not on
  // the click.
  await expect(page.getByRole('button', { name: 'Revoke access' })).toBeVisible()

  // --- The gate is open ----------------------------------------------------
  await signInAs(page, 'buyer')
  await page.goto(`${EN}/listings/${GATED_ASSET_ID}`)

  await expect(confidentialHeading).toBeVisible()
  await expect(legalName.first()).toBeVisible()
  // The seller's identity is released by the same predicate, not by a second
  // `grant === 'APPROVED'` check — so this is the other half of the gate.
  await expect(sellerName.first()).toBeVisible()
})
