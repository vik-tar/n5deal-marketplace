'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { AssetCategory, AssetStatus, BusinessStatus } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { StatusPill } from '@/components/domain/status-pill'
import { TeaserReviewPanel } from '@/components/domain/teaser-review-panel'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { parseEuros } from '@/lib/money'
import { assetInputSchema, MAX_INCLUDED_ITEMS, type AssetInput } from '@/lib/validation/asset'
import { saveDraft, submitForReview, type SaveDraftResult } from '@/server/actions/assets'
import type { ActionError } from '@/server/actions/types'

/** Everything the edit page (`@/app/[locale]/listings/[id]/edit/page.tsx`) already
 * loaded and narrowed — every `bigint` money column converted to `number`
 * before it ever reaches this client component (ruling 1, Task 15). Absent on
 * the "new listing" page: that is exactly what tells this component it is
 * creating rather than editing (see the doc comment on `ListingForm` below).
 */
export interface ListingFormInitial extends AssetInput {
  assetId: string
  publicRef: string
  status: AssetStatus
  rejectionReason: string | null
}

/** Translated per-field validation hint, keyed by which bound in `assetInputSchema` a field failed. */
const FIELD_ERROR_KEY: Record<keyof AssetInput, string> = {
  category: 'required',
  licenceType: 'required',
  businessType: 'required',
  country: 'country',
  regulator: 'required',
  businessStatus: 'required',
  askingPriceCents: 'positiveMoney',
  employees: 'nonNegativeInt',
  yearOfIssue: 'yearOfIssue',
  included: 'included',
  teaserTitle: 'teaserTitle',
  teaserDescription: 'teaserDescription',
  legalName: 'required',
  revenueCents: 'money',
  ebitdaCents: 'money',
  clientCount: 'nonNegativeInt',
  dataRoomUrl: 'url',
  confidentialNotes: 'tooLong',
}

type FieldErrors = Partial<Record<keyof AssetInput, string>>

/**
 * Reads the plain fields off the uncontrolled `<form>` (mirroring
 * `filter-sidebar.tsx`'s `handleApply`) and merges in `included`, which is
 * kept as separate React state because it is a repeatable list, not a single
 * control. Money fields go through `parseEuros`; a value it cannot parse is
 * fed through as `NaN`, which `assetInputSchema` rejects on the same field
 * path an out-of-range number would — this function does not need its own
 * notion of "unparseable", zod's is enough.
 */
function readFormValues(form: HTMLFormElement, included: string[]): Record<string, unknown> {
  const data = new FormData(form)
  const str = (name: string) => String(data.get(name) ?? '').trim()
  const money = (name: string) => parseEuros(str(name)) ?? Number.NaN
  const int = (name: string) => {
    const raw = str(name)
    return raw === '' ? Number.NaN : Number(raw)
  }

  return {
    category: str('category'),
    licenceType: str('licenceType'),
    businessType: str('businessType'),
    country: str('country'),
    regulator: str('regulator'),
    businessStatus: str('businessStatus'),
    askingPriceCents: money('askingPrice'),
    employees: int('employees'),
    yearOfIssue: int('yearOfIssue'),
    included: included.map((item) => item.trim()).filter((item) => item !== ''),
    teaserTitle: str('teaserTitle'),
    teaserDescription: str('teaserDescription'),
    legalName: str('legalName'),
    revenueCents: money('revenue'),
    ebitdaCents: money('ebitda'),
    clientCount: int('clientCount'),
    dataRoomUrl: str('dataRoomUrl'),
    confidentialNotes: str('confidentialNotes'),
  }
}

/**
 * The seller's listing editor, in two visually separated sections — this is
 * the product teaching the seller what the NDA gate does before they ever
 * hit it: the **public teaser** looks and behaves like an ordinary form, and
 * the **confidential** section beneath it is marked, explicitly, as released
 * only once they approve a buyer's access request — the same rule
 * `GatedSection` (`@/components/domain/gated-section`) enforces on the buyer
 * side of that same gate.
 *
 * `initial` absent means "new listing": only "Save draft" is offered, because
 * `runTeaserReview` and `submitForReview` both need a real `assetId` to act
 * on — there is nothing to check or submit before the first save creates one.
 * On success this navigates to the edit page for the asset `saveDraft` just
 * created, exactly the way `smart-search.tsx` and `filter-sidebar.tsx`
 * navigate via `useRouter()` rather than a native form GET. `initial` present
 * means "editing": both further buttons appear, and `TeaserReviewPanel`
 * (Task 15, Step 4) becomes reachable — it renders its own "Check teaser"
 * button only when `aiEnabled`, per ruling 5.
 */
export function ListingForm({
  initial,
  aiEnabled,
  locale,
}: {
  initial?: ListingFormInitial
  aiEnabled: boolean
  locale: string
}) {
  const t = useTranslations('listingForm')
  const tAssets = useTranslations('assets')
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [included, setIncluded] = useState<string[]>(initial?.included ?? [])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<ActionError | 'CLIENT_INVALID' | null>(null)
  const [notice, setNotice] = useState<
    'saved' | 'submitted' | 'unpublishedForReview' | 'suspendedSentForReview' | null
  >(null)
  const [isPending, startTransition] = useTransition()

  function addIncluded() {
    setIncluded((prev) => (prev.length >= MAX_INCLUDED_ITEMS ? prev : [...prev, '']))
  }
  function updateIncluded(index: number, value: string) {
    setIncluded((prev) => prev.map((item, i) => (i === index ? value : item)))
  }
  function removeIncluded(index: number) {
    setIncluded((prev) => prev.filter((_, i) => i !== index))
  }

  /** Runs the shared schema against the current form state; on failure, sets
   * one translated hint per offending field and returns `null` instead of
   * calling any Server Action — an unauthorized caller can still probe this
   * app's *real* rules only through the actions themselves (see
   * `@/server/actions/assets`), never through this purely client-side pass. */
  function validate(): AssetInput | null {
    const form = formRef.current
    if (!form) return null
    const result = assetInputSchema.safeParse(readFormValues(form, included))
    if (!result.success) {
      const errors: FieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field !== 'string' || field in errors) continue
        const key = FIELD_ERROR_KEY[field as keyof AssetInput] ?? 'required'
        errors[field as keyof AssetInput] = t(`errors.${key}`)
      }
      setFieldErrors(errors)
      setFormError('CLIENT_INVALID')
      setNotice(null)
      return null
    }
    setFieldErrors({})
    return result.data
  }

  /**
   * Which "your save also moved this listing" notice the save just earned, or
   * `null` if it moved nothing.
   *
   * `saveDraft`'s own doc comment (`@/server/actions/assets`) explains the
   * rule: an edit to a `'PUBLISHED'` **or** a `'SUSPENDED'` listing pulls it
   * back to `'PENDING_REVIEW'`, silently from this component's point of view
   * unless it says otherwise — a demotion the seller did not explicitly ask
   * for (they pressed "Save draft", not "unpublish") but must still see
   * plainly, per the ruling that a silent status change would be worse than
   * the gap it fixes.
   *
   * The two sources get different copy because only one of them is a
   * surprise about visibility: a `'PUBLISHED'` listing has just left the
   * public catalog, while a `'SUSPENDED'` one was never in it — telling that
   * seller their listing "is no longer publicly visible" would be false, and
   * would bury the thing that did change, which is that it is now queued for
   * a manager instead of sitting in a takedown.
   */
  function sentBackForReview(
    previousStatus: AssetStatus | undefined,
    result: SaveDraftResult,
  ): 'unpublishedForReview' | 'suspendedSentForReview' | null {
    if (!result.ok || result.status !== 'PENDING_REVIEW') return null
    if (previousStatus === 'PUBLISHED') return 'unpublishedForReview'
    if (previousStatus === 'SUSPENDED') return 'suspendedSentForReview'
    return null
  }

  function handleSave() {
    const data = validate()
    if (!data) return
    const previousStatus = initial?.status
    startTransition(async () => {
      const result = await saveDraft({ ...data, assetId: initial?.assetId, locale })
      if (!result.ok) {
        setFormError(result.error)
        setNotice(null)
        return
      }
      setFormError(null)
      if (!initial) {
        router.replace(`/listings/${result.assetId}/edit`)
        return
      }
      setNotice(sentBackForReview(previousStatus, result) ?? 'saved')
      router.refresh()
    })
  }

  function handleSubmitForReview() {
    if (!initial) return
    const data = validate()
    if (!data) return
    const assetId = initial.assetId
    const previousStatus = initial.status
    startTransition(async () => {
      const saved = await saveDraft({ ...data, assetId, locale })
      if (!saved.ok) {
        setFormError(saved.error)
        setNotice(null)
        return
      }
      const demoted = sentBackForReview(previousStatus, saved)
      if (demoted !== null) {
        // The save this button just performed already pulled the listing
        // back to `'PENDING_REVIEW'` — exactly the state "submit for
        // review" exists to reach. Calling `submitForReview` now would only
        // return `FORBIDDEN` (it accepts a `'DRAFT'`/`'REJECTED'` source
        // status, not `'PENDING_REVIEW'`) and that generic error would
        // obscure what actually happened to the listing. This is also what
        // makes the button honest on a `'SUSPENDED'` listing, where before
        // the demotion it was offered and then refused.
        setFormError(null)
        setNotice(demoted)
        router.refresh()
        return
      }
      const submitted = await submitForReview({ assetId, locale })
      if (!submitted.ok) {
        setFormError(submitted.error)
        setNotice(null)
        return
      }
      setFormError(null)
      setNotice('submitted')
      router.refresh()
    })
  }

  return (
    <form ref={formRef} className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
      {initial ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={initial.status} />
          <span className="text-sm text-ink-muted">{initial.publicRef}</span>
        </div>
      ) : null}

      {initial?.status === 'REJECTED' && initial.rejectionReason ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-ink">
          {t('rejectionNotice', { reason: initial.rejectionReason })}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <h2 className="text-base font-semibold text-ink">{t('sections.teaserTitle')}</h2>
          <p className="text-sm text-ink-muted">{t('sections.teaserBody')}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field label={t('fields.categoryLabel')} htmlFor="category" error={fieldErrors.category}>
            <select
              id="category"
              name="category"
              defaultValue={initial?.category ?? ASSET_CATEGORIES[0]}
              className="field-control"
            >
              {ASSET_CATEGORIES.map((category: AssetCategory) => (
                <option key={category} value={category}>
                  {tAssets(`category.${category}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('fields.businessStatusLabel')} htmlFor="businessStatus" error={fieldErrors.businessStatus}>
            <select
              id="businessStatus"
              name="businessStatus"
              defaultValue={initial?.businessStatus ?? BUSINESS_STATUSES[0]}
              className="field-control"
            >
              {BUSINESS_STATUSES.map((status: BusinessStatus) => (
                <option key={status} value={status}>
                  {tAssets(`businessStatus.${status}`)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.licenceTypeLabel')} htmlFor="licenceType" error={fieldErrors.licenceType}>
              <input
                id="licenceType"
                name="licenceType"
                type="text"
                defaultValue={initial?.licenceType ?? ''}
                placeholder={t('fields.licenceTypePlaceholder')}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.businessTypeLabel')} htmlFor="businessType" error={fieldErrors.businessType}>
              <input
                id="businessType"
                name="businessType"
                type="text"
                defaultValue={initial?.businessType ?? ''}
                placeholder={t('fields.businessTypePlaceholder')}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.countryLabel')} htmlFor="country" error={fieldErrors.country}>
              <input
                id="country"
                name="country"
                type="text"
                maxLength={2}
                defaultValue={initial?.country ?? ''}
                placeholder={t('fields.countryPlaceholder')}
                className="field-control uppercase"
              />
            </Field>
            <Field label={t('fields.regulatorLabel')} htmlFor="regulator" error={fieldErrors.regulator}>
              <input
                id="regulator"
                name="regulator"
                type="text"
                defaultValue={initial?.regulator ?? ''}
                placeholder={t('fields.regulatorPlaceholder')}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.askingPriceLabel')} htmlFor="askingPrice" error={fieldErrors.askingPriceCents}>
              <input
                id="askingPrice"
                name="askingPrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={initial ? initial.askingPriceCents / 100 : ''}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.employeesLabel')} htmlFor="employees" error={fieldErrors.employees}>
              <input
                id="employees"
                name="employees"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                defaultValue={initial?.employees ?? ''}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.yearOfIssueLabel')} htmlFor="yearOfIssue" error={fieldErrors.yearOfIssue}>
              <input
                id="yearOfIssue"
                name="yearOfIssue"
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                step="1"
                inputMode="numeric"
                defaultValue={initial?.yearOfIssue ?? ''}
                className="field-control"
              />
            </Field>
          </div>

          <Field label={t('fields.teaserTitleLabel')} htmlFor="teaserTitle" error={fieldErrors.teaserTitle}>
            <input
              id="teaserTitle"
              name="teaserTitle"
              type="text"
              maxLength={120}
              defaultValue={initial?.teaserTitle ?? ''}
              className="field-control"
            />
            <p className="text-xs text-ink-muted">{t('fields.teaserTitleHint')}</p>
          </Field>

          <Field
            label={t('fields.teaserDescriptionLabel')}
            htmlFor="teaserDescription"
            error={fieldErrors.teaserDescription}
          >
            <textarea
              id="teaserDescription"
              name="teaserDescription"
              rows={5}
              maxLength={2000}
              defaultValue={initial?.teaserDescription ?? ''}
              className="field-control"
            />
            <p className="text-xs text-ink-muted">{t('fields.teaserDescriptionHint')}</p>
          </Field>

          <div className="flex flex-col gap-2">
            <span className="meta-label">{t('fields.includedLabel')}</span>
            {included.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  maxLength={80}
                  onChange={(event) => updateIncluded(index, event.target.value)}
                  placeholder={t('fields.includedPlaceholder')}
                  aria-label={t('fields.includedItemLabel', { index: index + 1 })}
                  className="field-control"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeIncluded(index)}>
                  {t('fields.includedRemove')}
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addIncluded}
                disabled={included.length >= MAX_INCLUDED_ITEMS}
              >
                {t('fields.includedAdd')}
              </Button>
              <span className="text-xs text-ink-muted">{t('fields.includedHint')}</span>
            </div>
            {fieldErrors.included ? (
              <p role="alert" className="text-xs text-danger">
                {fieldErrors.included}
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {initial ? (
        <TeaserReviewPanel assetId={initial.assetId} locale={locale} aiEnabled={aiEnabled} />
      ) : null}

      <Card className="border-warning/30">
        <CardHeader className="flex-col items-start gap-1">
          <h2 className="text-base font-semibold text-ink">{t('sections.confidentialTitle')}</h2>
          <p className="text-sm text-ink-muted">{t('sections.confidentialBody')}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field label={t('fields.legalNameLabel')} htmlFor="legalName" error={fieldErrors.legalName}>
            <input
              id="legalName"
              name="legalName"
              type="text"
              defaultValue={initial?.legalName ?? ''}
              className="field-control"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.revenueLabel')} htmlFor="revenue" error={fieldErrors.revenueCents}>
              <input
                id="revenue"
                name="revenue"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={initial ? initial.revenueCents / 100 : ''}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.ebitdaLabel')} htmlFor="ebitda" error={fieldErrors.ebitdaCents}>
              <input
                id="ebitda"
                name="ebitda"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={initial ? initial.ebitdaCents / 100 : ''}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.clientCountLabel')} htmlFor="clientCount" error={fieldErrors.clientCount}>
              <input
                id="clientCount"
                name="clientCount"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                defaultValue={initial?.clientCount ?? ''}
                className="field-control"
              />
            </Field>
            <Field label={t('fields.dataRoomUrlLabel')} htmlFor="dataRoomUrl" error={fieldErrors.dataRoomUrl}>
              <input
                id="dataRoomUrl"
                name="dataRoomUrl"
                type="text"
                defaultValue={initial?.dataRoomUrl ?? ''}
                placeholder={t('fields.dataRoomUrlPlaceholder')}
                className="field-control"
              />
            </Field>
          </div>

          <Field
            label={t('fields.confidentialNotesLabel')}
            htmlFor="confidentialNotes"
            error={fieldErrors.confidentialNotes}
          >
            <textarea
              id="confidentialNotes"
              name="confidentialNotes"
              rows={4}
              maxLength={4000}
              defaultValue={initial?.confidentialNotes ?? ''}
              className="field-control"
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={isPending} onClick={handleSave}>
          {isPending ? t('actions.saving') : t('actions.saveDraft')}
        </Button>
        {initial ? (
          <Button type="button" disabled={isPending} onClick={handleSubmitForReview}>
            {isPending ? t('actions.submitting') : t('actions.submitForReview')}
          </Button>
        ) : null}
      </div>

      {formError === 'CLIENT_INVALID' ? (
        <p role="alert" className="text-sm text-danger">
          {t('errors.form')}
        </p>
      ) : formError ? (
        <p role="alert" className="text-sm text-danger">
          {t(`error.${formError}`)}
        </p>
      ) : null}
      {notice === 'saved' ? <p className="text-sm text-success">{t('savedNotice')}</p> : null}
      {notice === 'submitted' ? <p className="text-sm text-success">{t('submittedNotice')}</p> : null}
      {notice === 'unpublishedForReview' ? (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-ink">
          {t('unpublishedForReviewNotice')}
        </p>
      ) : null}
      {notice === 'suspendedSentForReview' ? (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-ink">
          {t('suspendedSentForReviewNotice')}
        </p>
      ) : null}
    </form>
  )
}
