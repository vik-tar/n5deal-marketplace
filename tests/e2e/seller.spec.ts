import { expect, test } from '@playwright/test'
import {
  EN,
  confirmModerationDialog,
  expectAnonymous,
  gotoCatalogFilteredTo,
  listingCards,
  signInAs,
  signOut,
} from './helpers'

/**
 * The seller flow: a listing that does not exist becomes one an anonymous
 * visitor can see, and it only gets there by passing through a manager.
 *
 * The load-bearing claim is the last one. Every intermediate step is
 * observable in a unit test on its own — `saveDraft` allocates a `publicRef`,
 * `submitForReview` moves `DRAFT` to `PENDING_REVIEW`, `moderateListing`
 * moves `PENDING_REVIEW` to `PUBLISHED` — but "and therefore a visitor with
 * no session sees it in the catalog" spans three sessions, two Server
 * Actions, a `revalidatePath` and the catalog's visibility floor, and nothing
 * short of a browser can assert it.
 *
 * The confidentiality review (`TeaserReviewPanel`) does not appear anywhere in
 * this flow: this project ships with `ANTHROPIC_API_KEY` unset by the user's
 * decision, so `isAiEnabled()` is false and the panel renders no control.
 * That is the designed configuration, and the flow must not depend on it.
 */

/** Long enough for `moderationReasonSchema`'s 10-character floor. */
const APPROVAL_NOTE = 'Teaser reads clean and the licence details check out.'

test('a seller creates a listing, a manager publishes it, and an anonymous visitor sees it', async ({
  page,
}) => {
  // --- The seller creates the listing -------------------------------------
  await signInAs(page, 'seller')
  await page.goto(`${EN}/listings/new`)

  // Addressed by `id`, not by label: every field id in `listing-form.tsx` is
  // written in the component, while the labels come out of the `listingForm`
  // message namespace.
  await page.locator('#category').selectOption('EMI')
  await page.locator('#businessStatus').selectOption('ACTIVE')
  await page.locator('#licenceType').fill('EMI')
  await page.locator('#businessType').fill('Card issuing and processing')
  await page.locator('#country').fill('MT')
  await page.locator('#regulator').fill('MFSA')
  await page.locator('#askingPrice').fill('2500000')
  await page.locator('#employees').fill('24')
  await page.locator('#yearOfIssue').fill('2019')
  await page.locator('#teaserTitle').fill('End-to-end test listing - EMI licence, Malta')
  await page
    .locator('#teaserDescription')
    .fill(
      'An operating e-money institution created by the end-to-end suite, holding an MFSA-issued EMI licence. Included in the sale: the licence and the compliance function.',
    )
  await page.locator('#legalName').fill('E2E Test Institution Ltd')
  await page.locator('#revenue').fill('1800000')
  await page.locator('#ebitda').fill('320000')
  await page.locator('#clientCount').fill('410')

  // On a new listing "Save draft" is the only button offered — `submitForReview`
  // needs an `assetId`, which does not exist until this save allocates one —
  // and the form navigates to the edit page for the row it just created.
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(new RegExp(`${EN}/listings/[^/]+/edit$`))

  // The public reference is allocated server-side by `nextPublicRef`, so it is
  // read off the page rather than predicted.
  const heading = await page.getByRole('heading', { level: 1 }).textContent()
  const match = heading?.match(/N5-\d+/)
  expect(match, `expected a public reference in the edit page heading, got: ${heading}`).not.toBeNull()
  const publicRef = match![0]

  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  // --- The seller submits it for review -----------------------------------
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Submitted for review.', { exact: false })).toBeVisible()
  await expect(page.getByText('Pending review', { exact: true })).toBeVisible()

  // A listing in the review queue is not in the catalog. Asserted before the
  // approval so the final assertion cannot pass by accident — without this,
  // a catalog that showed everything regardless of status would still make
  // the last step green.
  await signOut(page)
  await gotoCatalogFilteredTo(page, publicRef)
  await expect(listingCards(page)).toHaveCount(0)

  // --- The manager approves it --------------------------------------------
  await signInAs(page, 'manager')
  await page.goto(`${EN}/admin?tab=assets&assetStatuses=PENDING_REVIEW`)

  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: publicRef, exact: true }) })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Approve' }).click()
  await confirmModerationDialog(page, APPROVAL_NOTE, 'Publish listing')

  // The table is still filtered to `PENDING_REVIEW`, so the row leaving it is
  // the status change itself, observed rather than assumed.
  await expect(page.getByRole('link', { name: publicRef, exact: true })).toHaveCount(0)

  // --- An anonymous visitor sees it ---------------------------------------
  await signOut(page)
  await gotoCatalogFilteredTo(page, publicRef)
  await expectAnonymous(page)

  await expect(listingCards(page)).toHaveCount(1)
  await expect(listingCards(page)).toContainText(publicRef)
  await expect(
    page.getByRole('heading', { name: 'End-to-end test listing - EMI licence, Malta' }),
  ).toBeVisible()
})
