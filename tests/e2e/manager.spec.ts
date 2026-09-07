import { expect, test } from '@playwright/test'
import { DEMO_ACCOUNTS } from '../../prisma/seed-data/participants'
import {
  EN,
  assetFixture,
  confirmModerationDialog,
  expectAnonymous,
  gotoCatalogFilteredTo,
  listingCards,
  signInAs,
  signOut,
} from './helpers'

/**
 * The manager flow: the moderation cascade, both ways.
 *
 * Suspending an account is a one-row write to `User.status`, and the whole
 * point of it is a consequence two tables away: `VISIBILITY_FLOOR`
 * (`@/server/queries/asset-where`) requires a `PUBLISHED` listing *and* an
 * `ACTIVE` owner, so the seller's catalog entries stop existing for everyone
 * else without anything touching the `Asset` rows. A unit test can assert the
 * `where` clause contains the floor; only a browser can assert that a
 * listing an anonymous visitor could see a moment ago is now gone, and comes
 * back untouched on reinstatement.
 *
 * The suspension is checked from a *signed-out* session on purpose. A
 * suspended viewer browses exactly what an anonymous visitor browses (settled
 * `canViewAsset`), so checking as the suspended seller would conflate "your own
 * listing is hidden from you" with "it is hidden from the market".
 */

/**
 * `asset-701`: `PUBLISHED` and owned by `seller@n5deal.demo`, so the account
 * this spec suspends is one of the three the login page offers — no
 * hand-typed credentials, and the reinstatement is verifiable through the
 * same demo button the other two specs use.
 */
const TARGET_ASSET_ID = 'asset-701'

const SUSPEND_REASON = 'Verifying the moderation cascade end to end; reinstated immediately after.'
const REINSTATE_REASON = 'Cascade check complete; restoring the account to its seeded state.'

test('a manager suspends a seller, the catalog loses their listing, and reinstating brings it back', async ({
  page,
}) => {
  const { publicRef } = assetFixture(TARGET_ASSET_ID)
  const sellerEmail = DEMO_ACCOUNTS.seller

  // The console row for this account. `buildParticipantWhere` searches email,
  // so one query parameter narrows the participants table to it.
  const participantsUrl = `${EN}/admin?tab=participants&q=${encodeURIComponent(sellerEmail)}`
  const sellerRow = page.getByRole('row').filter({ hasText: sellerEmail })

  // --- Anonymous: the listing is in the catalog ----------------------------
  await gotoCatalogFilteredTo(page, publicRef)
  await expectAnonymous(page)
  await expect(listingCards(page)).toHaveCount(1)
  await expect(listingCards(page)).toContainText(publicRef)

  // --- The manager suspends its seller -------------------------------------
  await signInAs(page, 'manager')
  await page.goto(participantsUrl)
  await expect(sellerRow).toHaveCount(1)
  await sellerRow.getByRole('button', { name: 'Suspend' }).click()
  await confirmModerationDialog(page, SUSPEND_REASON, 'Suspend account')
  await expect(sellerRow.getByText('Suspended', { exact: true })).toBeVisible()

  // --- Anonymous: the listing is gone --------------------------------------
  await signOut(page)
  await gotoCatalogFilteredTo(page, publicRef)
  await expectAnonymous(page)
  await expect(listingCards(page)).toHaveCount(0)
  await expect(page.getByText('No listings match your filters')).toBeVisible()

  // --- The manager reinstates ----------------------------------------------
  await signInAs(page, 'manager')
  await page.goto(participantsUrl)
  await sellerRow.getByRole('button', { name: 'Reinstate' }).click()
  await confirmModerationDialog(page, REINSTATE_REASON, 'Reinstate account')
  await expect(sellerRow.getByText('Active', { exact: true })).toBeVisible()

  // --- Anonymous: the listing is back --------------------------------------
  await signOut(page)
  await gotoCatalogFilteredTo(page, publicRef)
  await expectAnonymous(page)
  await expect(listingCards(page)).toHaveCount(1)
  await expect(listingCards(page)).toContainText(publicRef)

  // Nothing was deleted while the account was away: the listing comes back
  // with its own unchanged teaser, not as a fresh row.
  await expect(page.getByRole('heading', { name: assetFixture(TARGET_ASSET_ID).teaserTitle })).toBeVisible()
})
