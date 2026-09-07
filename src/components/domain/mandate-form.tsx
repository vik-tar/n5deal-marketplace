'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { BUYER_TYPES, MANDATE_LICENCE_TYPES } from '@/lib/filters/buyer-filters'
import { parseEuros } from '@/lib/money'
import {
  MAX_BIO_LENGTH,
  MAX_MANDATE_NOTES,
  MAX_TIMELINE_MONTHS,
  MIN_TIMELINE_MONTHS,
  buyerProfileSchema,
  mandateSchema,
  type BuyerProfileInput,
  type MandateInput,
} from '@/lib/validation/profile'
import { COUNTRY_CODE_LENGTH } from '@/lib/validation/primitives'
import {
  saveBuyerProfile,
  saveMandate,
  type MandateMatchSummary,
} from '@/server/actions/profile'
import type { ActionError } from '@/server/actions/types'
import { FOCUS_RING, cn } from '@/lib/cn'

/** Everything the profile page already loaded, with every `bigint` money
 * column on the mandate converted to `number` before it ever reaches this
 * client component (ruling 5, Task 16) — the same rule `ListingFormInitial`
 * (`@/components/domain/listing-form`) documents for Task 15's own money
 * columns. Plain aliases, not `extends`-ed interfaces: unlike `ListingFormInitial`,
 * neither shape adds a field beyond its schema's own, so an `interface … extends`
 * here would declare no members of its own. */
export type MandateFormInitialProfile = BuyerProfileInput
export type MandateFormInitialMandate = MandateInput

type ProfileFieldErrors = Partial<Record<keyof BuyerProfileInput, string>>
type MandateFieldErrors = Partial<Record<keyof MandateInput, string>>

const PROFILE_FIELD_ERROR_KEY: Record<keyof BuyerProfileInput, string> = {
  displayName: 'required',
  buyerType: 'required',
  country: 'country',
  bio: 'tooLong',
  websiteUrl: 'url',
}

const MANDATE_FIELD_ERROR_KEY: Record<keyof MandateInput, string> = {
  categories: 'invalidSelection',
  countries: 'country',
  licenceTypes: 'invalidSelection',
  businessStatuses: 'invalidSelection',
  ticketMinCents: 'money',
  ticketMaxCents: 'ticketRange',
  timelineMonths: 'timeline',
  notes: 'tooLong',
}

const checkboxClass = cn(
  'h-4 w-4 shrink-0 rounded border-border bg-surface-2 accent-accent',
  FOCUS_RING,
)

/** A toggleable pill. `active` drives both the visual state and `aria-pressed`. */
function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition',
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-surface-2 text-ink-muted hover:border-accent/60 hover:text-ink',
        FOCUS_RING,
      )}
    >
      {label}
    </button>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Blank means "no bound" (`null`, valid); a non-blank, unparseable amount
 * becomes `NaN`, which `mandateSchema`'s `z.number().int()` rejects — the
 * same convention `listing-form.tsx`'s `readFormValues` uses for a required
 * money field, extended here to a field that is legitimately nullable. */
function readOptionalMoney(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return parseEuros(trimmed) ?? Number.NaN
}

export function MandateForm({
  profile,
  mandate,
  match,
  locale,
}: {
  profile: MandateFormInitialProfile
  mandate: MandateFormInitialMandate
  match: MandateMatchSummary
  locale: string
}) {
  const t = useTranslations('profile')
  const tAssets = useTranslations('assets')
  const router = useRouter()

  // --- Buyer profile section: uncontrolled inputs read via FormData at
  // submit, mirroring `listing-form.tsx`'s `readFormValues` convention. ---
  const profileFormRef = useRef<HTMLFormElement>(null)
  const [profileFieldErrors, setProfileFieldErrors] = useState<ProfileFieldErrors>({})
  const [profileFormError, setProfileFormError] = useState<ActionError | 'CLIENT_INVALID' | null>(
    null,
  )
  const [profileNotice, setProfileNotice] = useState<'saved' | null>(null)
  const [isProfilePending, startProfileTransition] = useTransition()

  function readProfileValues(form: HTMLFormElement): Record<string, unknown> {
    const data = new FormData(form)
    const str = (name: string) => String(data.get(name) ?? '').trim()
    return {
      displayName: str('displayName'),
      buyerType: str('buyerType'),
      country: str('country'),
      bio: str('bio'),
      websiteUrl: str('websiteUrl'),
    }
  }

  function validateProfile(): BuyerProfileInput | null {
    const form = profileFormRef.current
    if (!form) return null
    const result = buyerProfileSchema.safeParse(readProfileValues(form))
    if (!result.success) {
      const errors: ProfileFieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field !== 'string' || field in errors) continue
        const key = PROFILE_FIELD_ERROR_KEY[field as keyof BuyerProfileInput] ?? 'required'
        errors[field as keyof BuyerProfileInput] = t(`errors.${key}`)
      }
      setProfileFieldErrors(errors)
      setProfileFormError('CLIENT_INVALID')
      setProfileNotice(null)
      return null
    }
    setProfileFieldErrors({})
    return result.data
  }

  function handleSaveProfile() {
    const data = validateProfile()
    if (!data) return
    startProfileTransition(async () => {
      const result = await saveBuyerProfile({ ...data, locale })
      if (!result.ok) {
        setProfileFormError(result.error)
        setProfileNotice(null)
        return
      }
      setProfileFormError(null)
      setProfileNotice('saved')
      router.refresh()
    })
  }

  // --- Mandate section: fully controlled state — chip toggles and the
  // country tag list need React state, not a native uncontrolled form. ---
  const [categories, setCategories] = useState<AssetCategory[]>(mandate.categories)
  const [countries, setCountries] = useState<string[]>(mandate.countries)
  const [countryDraft, setCountryDraft] = useState('')
  const [countryDraftError, setCountryDraftError] = useState(false)
  const [licenceTypes, setLicenceTypes] = useState<string[]>(mandate.licenceTypes)
  const [businessStatuses, setBusinessStatuses] = useState<BusinessStatus[]>(
    mandate.businessStatuses,
  )
  const [ticketMin, setTicketMin] = useState(
    mandate.ticketMinCents !== null ? String(mandate.ticketMinCents / 100) : '',
  )
  const [ticketMax, setTicketMax] = useState(
    mandate.ticketMaxCents !== null ? String(mandate.ticketMaxCents / 100) : '',
  )
  const [timelineEnabled, setTimelineEnabled] = useState(mandate.timelineMonths !== null)
  const [timelineMonths, setTimelineMonths] = useState(mandate.timelineMonths ?? 12)
  const [notes, setNotes] = useState(mandate.notes)

  const [mandateFieldErrors, setMandateFieldErrors] = useState<MandateFieldErrors>({})
  const [mandateFormError, setMandateFormError] = useState<ActionError | 'CLIENT_INVALID' | null>(
    null,
  )
  const [mandateNotice, setMandateNotice] = useState<'saved' | null>(null)
  const [matchSummary, setMatchSummary] = useState<MandateMatchSummary>(match)
  const [isMandatePending, startMandateTransition] = useTransition()

  function addCountry() {
    const code = countryDraft.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setCountryDraftError(true)
      return
    }
    setCountryDraftError(false)
    setCountryDraft('')
    if (countries.includes(code)) return
    setCountries((prev) => [...prev, code])
  }

  function buildMandateValues(): Record<string, unknown> {
    return {
      categories,
      countries,
      licenceTypes,
      businessStatuses,
      ticketMinCents: readOptionalMoney(ticketMin),
      ticketMaxCents: readOptionalMoney(ticketMax),
      timelineMonths: timelineEnabled ? timelineMonths : null,
      notes,
    }
  }

  function validateMandate(): MandateInput | null {
    const result = mandateSchema.safeParse(buildMandateValues())
    if (!result.success) {
      const errors: MandateFieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field !== 'string' || field in errors) continue
        const key = MANDATE_FIELD_ERROR_KEY[field as keyof MandateInput] ?? 'invalidSelection'
        errors[field as keyof MandateInput] = t(`errors.${key}`)
      }
      setMandateFieldErrors(errors)
      setMandateFormError('CLIENT_INVALID')
      setMandateNotice(null)
      return null
    }
    setMandateFieldErrors({})
    return result.data
  }

  function handleSaveMandate() {
    const data = validateMandate()
    if (!data) return
    startMandateTransition(async () => {
      const result = await saveMandate({ ...data, locale })
      if (!result.ok) {
        setMandateFormError(result.error)
        setMandateNotice(null)
        return
      }
      setMandateFormError(null)
      setMandateNotice('saved')
      setMatchSummary({
        matchCount: result.matchCount,
        totalListings: result.totalListings,
        specificity: result.specificity,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <h2 className="text-base font-semibold text-ink">{t('profileSection.title')}</h2>
          <p className="text-sm text-ink-muted">{t('profileSection.subtitle')}</p>
        </CardHeader>
        <CardBody>
          <form
            ref={profileFormRef}
            className="flex flex-col gap-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <Field
              label={t('profileSection.fields.displayNameLabel')}
              htmlFor="displayName"
              error={profileFieldErrors.displayName}
            >
              <input
                id="displayName"
                name="displayName"
                type="text"
                defaultValue={profile.displayName}
                className="field-control"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('profileSection.fields.buyerTypeLabel')}
                htmlFor="buyerType"
                error={profileFieldErrors.buyerType}
              >
                <select
                  id="buyerType"
                  name="buyerType"
                  defaultValue={profile.buyerType}
                  className="field-control"
                >
                  {BUYER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`buyerType.${type}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t('profileSection.fields.countryLabel')}
                htmlFor="profileCountry"
                error={profileFieldErrors.country}
              >
                <input
                  id="profileCountry"
                  name="country"
                  type="text"
                  maxLength={COUNTRY_CODE_LENGTH}
                  defaultValue={profile.country}
                  placeholder={t('profileSection.fields.countryPlaceholder')}
                  className="field-control uppercase"
                />
              </Field>
            </div>

            <Field
              label={t('profileSection.fields.bioLabel')}
              htmlFor="bio"
              error={profileFieldErrors.bio}
            >
              <textarea
                id="bio"
                name="bio"
                rows={3}
                maxLength={MAX_BIO_LENGTH}
                defaultValue={profile.bio}
                placeholder={t('profileSection.fields.bioPlaceholder')}
                className="field-control"
              />
            </Field>

            <Field
              label={t('profileSection.fields.websiteUrlLabel')}
              htmlFor="websiteUrl"
              error={profileFieldErrors.websiteUrl}
            >
              <input
                id="websiteUrl"
                name="websiteUrl"
                type="text"
                defaultValue={profile.websiteUrl ?? ''}
                placeholder={t('profileSection.fields.websiteUrlPlaceholder')}
                className="field-control"
              />
            </Field>

            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={isProfilePending}
                onClick={handleSaveProfile}
              >
                {isProfilePending ? t('actions.saving') : t('actions.saveProfile')}
              </Button>
            </div>

            {profileFormError === 'CLIENT_INVALID' ? (
              <p role="alert" className="text-sm text-danger">
                {t('errors.form')}
              </p>
            ) : profileFormError ? (
              <p role="alert" className="text-sm text-danger">
                {t(`error.${profileFormError}`)}
              </p>
            ) : null}
            {profileNotice === 'saved' ? (
              <p className="text-sm text-success">{t('profileSection.savedNotice')}</p>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card className="border-accent/30">
        <CardHeader className="flex-col items-start gap-1">
          <h2 className="text-base font-semibold text-ink">{t('mandate.title')}</h2>
          <p className="text-sm text-ink-muted">{t('mandate.subtitle')}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div
            role="status"
            className={cn(
              'rounded-md border px-4 py-3 text-sm text-ink',
              matchSummary.specificity === 0
                ? 'border-warning/40 bg-warning/10'
                : 'border-accent/30 bg-accent/10',
            )}
          >
            {matchSummary.specificity === 0
              ? t('mandate.matchSummary.unconstrained')
              : t('mandate.matchSummary.count', {
                  matchCount: matchSummary.matchCount,
                  totalListings: matchSummary.totalListings,
                })}
          </div>

          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="meta-label mb-1">{t('mandate.fields.categoriesLabel')}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={categories.length === 0}
                  label={t('mandate.any.category')}
                  onClick={() => setCategories([])}
                />
                {ASSET_CATEGORIES.map((category) => (
                  <Chip
                    key={category}
                    active={categories.includes(category)}
                    label={tAssets(`category.${category}`)}
                    onClick={() => setCategories((prev) => toggle(prev, category))}
                  />
                ))}
              </div>
              {mandateFieldErrors.categories ? (
                <p role="alert" className="text-xs text-danger">
                  {mandateFieldErrors.categories}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="meta-label mb-1">{t('mandate.fields.countriesLabel')}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {countries.length === 0 ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-ink-muted">
                    {t('mandate.any.country')}
                  </span>
                ) : (
                  countries.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCountries((prev) => prev.filter((c) => c !== code))}
                      aria-label={t('mandate.fields.removeCountry', { code })}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/15 px-3 py-1 text-xs font-medium text-accent transition hover:opacity-80',
                        FOCUS_RING,
                      )}
                    >
                      <span>{code}</span>
                      <span aria-hidden="true">&times;</span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={countryDraft}
                  onChange={(event) => {
                    setCountryDraft(event.target.value)
                    setCountryDraftError(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addCountry()
                    }
                  }}
                  maxLength={COUNTRY_CODE_LENGTH}
                  placeholder={t('mandate.fields.countryAddPlaceholder')}
                  aria-label={t('mandate.fields.countryAddPlaceholder')}
                  className="field-control w-24 uppercase"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addCountry}>
                  {t('mandate.fields.countryAdd')}
                </Button>
              </div>
              {countryDraftError || mandateFieldErrors.countries ? (
                <p role="alert" className="text-xs text-danger">
                  {mandateFieldErrors.countries ?? t('errors.country')}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="meta-label mb-1">{t('mandate.fields.licenceTypesLabel')}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={licenceTypes.length === 0}
                  label={t('mandate.any.licenceType')}
                  onClick={() => setLicenceTypes([])}
                />
                {MANDATE_LICENCE_TYPES.map((licenceType) => (
                  <Chip
                    key={licenceType}
                    active={licenceTypes.includes(licenceType)}
                    label={t(`licenceType.${licenceType}`)}
                    onClick={() => setLicenceTypes((prev) => toggle(prev, licenceType))}
                  />
                ))}
              </div>
              {mandateFieldErrors.licenceTypes ? (
                <p role="alert" className="text-xs text-danger">
                  {mandateFieldErrors.licenceTypes}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="meta-label mb-1">
                {t('mandate.fields.businessStatusesLabel')}
              </legend>
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={businessStatuses.length === 0}
                  label={t('mandate.any.businessStatus')}
                  onClick={() => setBusinessStatuses([])}
                />
                {BUSINESS_STATUSES.map((status) => (
                  <Chip
                    key={status}
                    active={businessStatuses.includes(status)}
                    label={tAssets(`businessStatus.${status}`)}
                    onClick={() => setBusinessStatuses((prev) => toggle(prev, status))}
                  />
                ))}
              </div>
              {mandateFieldErrors.businessStatuses ? (
                <p role="alert" className="text-xs text-danger">
                  {mandateFieldErrors.businessStatuses}
                </p>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('mandate.fields.ticketMinLabel')}
                  htmlFor="ticketMin"
                  error={mandateFieldErrors.ticketMinCents}
                >
                  <input
                    id="ticketMin"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={ticketMin}
                    onChange={(event) => setTicketMin(event.target.value)}
                    placeholder={t('mandate.fields.ticketPlaceholder')}
                    className="field-control"
                  />
                </Field>
                <Field
                  label={t('mandate.fields.ticketMaxLabel')}
                  htmlFor="ticketMax"
                  error={mandateFieldErrors.ticketMaxCents}
                >
                  <input
                    id="ticketMax"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={ticketMax}
                    onChange={(event) => setTicketMax(event.target.value)}
                    placeholder={t('mandate.fields.ticketPlaceholder')}
                    className="field-control"
                  />
                </Field>
              </div>
              {ticketMin === '' && ticketMax === '' ? (
                <p className="text-xs text-ink-muted">{t('mandate.any.ticket')}</p>
              ) : null}
            </div>

            <Field
              label={t('mandate.fields.timelineLabel')}
              htmlFor="timelineMonths"
              error={mandateFieldErrors.timelineMonths}
            >
              <div className="flex items-center gap-3">
                <input
                  id="timelineMonths"
                  type="range"
                  min={MIN_TIMELINE_MONTHS}
                  max={MAX_TIMELINE_MONTHS}
                  step={1}
                  disabled={!timelineEnabled}
                  value={timelineMonths}
                  onChange={(event) => setTimelineMonths(Number(event.target.value))}
                  className="w-full accent-accent disabled:opacity-40"
                />
                <span className="w-28 shrink-0 text-right text-sm text-ink-muted">
                  {timelineEnabled
                    ? t('mandate.fields.timelineValue', { count: timelineMonths })
                    : t('mandate.any.timeline')}
                </span>
              </div>
              <label className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={!timelineEnabled}
                  onChange={(event) => setTimelineEnabled(!event.target.checked)}
                  className={checkboxClass}
                />
                {t('mandate.fields.timelineNoPreference')}
              </label>
            </Field>

            <Field
              label={t('mandate.fields.notesLabel')}
              htmlFor="notes"
              error={mandateFieldErrors.notes}
            >
              <textarea
                id="notes"
                rows={4}
                maxLength={MAX_MANDATE_NOTES}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('mandate.fields.notesPlaceholder')}
                className="field-control"
              />
            </Field>

            <div>
              <Button
                type="button"
                disabled={isMandatePending}
                onClick={handleSaveMandate}
              >
                {isMandatePending ? t('actions.saving') : t('actions.saveMandate')}
              </Button>
            </div>

            {mandateFormError === 'CLIENT_INVALID' ? (
              <p role="alert" className="text-sm text-danger">
                {t('errors.form')}
              </p>
            ) : mandateFormError ? (
              <p role="alert" className="text-sm text-danger">
                {t(`error.${mandateFormError}`)}
              </p>
            ) : null}
            {mandateNotice === 'saved' ? (
              <p className="text-sm text-success">{t('mandate.savedNotice')}</p>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
