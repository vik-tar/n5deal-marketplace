'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { UnsavedMarker } from '@/components/ui/unsaved-marker'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { BUYER_TYPES, MANDATE_LICENCE_TYPES } from '@/lib/filters/buyer-filters'
import { mandateCriteriaKey } from '@/lib/matching'
import { useUnsavedChanges } from '@/components/domain/use-unsaved-changes'
import { parseEuros } from '@/lib/money'
import {
  MAX_BIO_LENGTH,
  MAX_MANDATE_NOTES,
  MAX_TIMELINE_MONTHS,
  MIN_TIMELINE_MONTHS,
  buyerProfileSchema,
  mandateCriteriaSchema,
  mandateSchema,
  type BuyerProfileInput,
  type MandateInput,
} from '@/lib/validation/profile'
import { COUNTRY_CODE_LENGTH } from '@/lib/validation/primitives'
import {
  countMandateMatches,
  saveBuyerProfile,
  saveMandate,
  type MandateMatchSummary,
} from '@/server/actions/profile'
import type { ActionError } from '@/server/actions/types'
import { attempt } from '@/lib/action-result'
import { FOCUS_RING, cn } from '@/lib/cn'

/** Everything the profile page already loaded, with every `bigint` money
 * column on the mandate converted to `number` before it ever reaches this
 * client component — the same rule `ListingFormInitial`
 * (`@/components/domain/listing-form`) documents for a listing's own money
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
  ticketMaxCents: 'money',
  timelineMonths: 'timeline',
  notes: 'tooLong',
}

/**
 * Which translated hint one zod issue earns — keyed on the issue's `code` as
 * well as its field, because the field alone does not identify the rule that
 * was broken.
 *
 * `ticketMaxCents` is the field where that matters: it carries both its own
 * value rules (`z.number().int().nonnegative()`) and the cross-field
 * refinement from `mandateSchema` (`@/lib/validation/profile`), whose issue is
 * deliberately attached to it rather than to the object. Mapping the path
 * alone sent every failure to `errors.ticketRange` — so typing `-5`, or an
 * amount `parseEuros` cannot read (which `readOptionalMoney` turns into
 * `NaN`), answered "The maximum ticket must be at least the minimum" about a
 * minimum the buyer may not even have set.
 *
 * `custom` is the code zod gives a `.refine()` issue and nothing else here
 * produces one, so it identifies the cross-field rule exactly. The two can
 * never both fire: zod skips an object's refinements when the object's own
 * fields failed, which is also why the first-issue-per-field rule below stays
 * unambiguous.
 *
 * `listing-form.tsx` keys the same way off the path alone and stays correct:
 * `assetInputSchema` has no refinement at all, so no field there has a second,
 * differently-worded failure mode to confuse with its first.
 */
function mandateErrorKey(field: keyof MandateInput, code: string): string {
  if (code === 'custom' && field === 'ticketMaxCents') return 'ticketRange'
  return MANDATE_FIELD_ERROR_KEY[field] ?? 'invalidSelection'
}

/** Debounce before a criteria edit costs a catalogue scan. */
const RECOUNT_DEBOUNCE_MS = 400

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
  const profileUnsavedId = useId()
  const mandateUnsavedId = useId()

  const profileFormRef = useRef<HTMLFormElement>(null)
  const [profileFieldErrors, setProfileFieldErrors] = useState<ProfileFieldErrors>({})
  const [profileFormError, setProfileFormError] = useState<ActionError | 'CLIENT_INVALID' | null>(
    null,
  )
  const [profileNotice, setProfileNotice] = useState<'saved' | null>(null)
  const [isProfilePending, startProfileTransition] = useTransition()

  /**
   * The profile values as last written to the database — the baseline the
   * unsaved marker compares against. Starts at what the page loaded.
   */
  const [savedProfile, setSavedProfile] = useState<BuyerProfileInput>(profile)
  const [isProfileDirty, setIsProfileDirty] = useState(false)

  /**
   * Nothing in this section is marked wrong until it has been submitted once.
   * Going red for an incomplete field while it is still being filled in is
   * nagging; pressing the button is the user saying they think it is done,
   * which is the moment to disagree. Afterwards the errors stay live and clear
   * on blur as each field is fixed.
   *
   * The unsaved-changes marker is unaffected and still updates per keystroke —
   * "you have edits here" is a fact about the form, not a complaint about it.
   */
  const [hasProfileSubmitted, setHasProfileSubmitted] = useState(false)

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

  /** The first issue per field, translated — shared by the blur pass and the save pass. */
  function profileIssues(result: ReturnType<typeof buyerProfileSchema.safeParse>): ProfileFieldErrors {
    if (result.success) return {}
    const errors: ProfileFieldErrors = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (typeof field !== 'string' || field in errors) continue
      const key = PROFILE_FIELD_ERROR_KEY[field as keyof BuyerProfileInput] ?? 'required'
      errors[field as keyof BuyerProfileInput] = t(`errors.${key}`)
    }
    return errors
  }

  /**
   * Re-checks the profile section whenever focus leaves one of its fields, so
   * an emptied required field turns red the moment the buyer looks away rather
   * than when they eventually press this section's own button.
   *
   * This page carries two independent forms with two independent buttons —
   * `Buyer profile` and `Investment mandate` — and until this ran on blur, the
   * gap between them was reachable and confusing: clear the display name, press
   * **Save mandate**, and the page answers with a green "Mandate saved." while
   * the emptied required field sits above it looking untouched. Nothing wrong
   * had been written (the profile action is never called, and `saveBuyerProfile`
   * would refuse an empty name anyway) — but the screen said success and the
   * reload put the old name back, which reads exactly like a save that silently
   * dropped a field.
   *
   * Only field errors are set here, never `profileFormError`: "Fix the
   * highlighted fields" is an answer to pressing a button, and nobody has
   * pressed one yet. One handler on the `<form>` rather than per input —
   * React's `onBlur` bubbles.
   */
  function revalidateProfileFields(): void {
    if (!hasProfileSubmitted) return
    const form = profileFormRef.current
    if (!form) return
    setProfileFieldErrors(profileIssues(buyerProfileSchema.safeParse(readProfileValues(form))))
  }

  /**
   * Whether this section holds edits that have not been written.
   *
   * Compares *parsed* values, not raw text, so retyping `mt` over `MT` or
   * padding a name with spaces is not an edit — the schema normalises both to
   * the same thing, and a marker that lights up for a change the database
   * cannot see is a marker people learn to ignore. Input the schema rejects
   * counts as dirty by definition: it cannot be what was saved.
   *
   * Driven by handlers rather than derived during render, unlike the mandate
   * section below. These inputs are uncontrolled — their values live in the
   * DOM and are read through `FormData` — and reading the DOM during render is
   * exactly what React forbids. The asymmetry is in the two sections, not in
   * the rule.
   */
  function recomputeProfileDirty(): void {
    const form = profileFormRef.current
    if (!form) return
    const parsed = buyerProfileSchema.safeParse(readProfileValues(form))
    setIsProfileDirty(
      !parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(savedProfile),
    )
  }

  function validateProfile(): BuyerProfileInput | null {
    const form = profileFormRef.current
    if (!form) return null
    const result = buyerProfileSchema.safeParse(readProfileValues(form))
    if (!result.success) {
      setProfileFieldErrors(profileIssues(result))
      setProfileFormError('CLIENT_INVALID')
      setProfileNotice(null)
      return null
    }
    setProfileFieldErrors({})
    return result.data
  }

  function handleSaveProfile() {
    setHasProfileSubmitted(true)
    // An invalid submit stops here — `saveBuyerProfile` is never called, on
    // this attempt or any later one.
    const data = validateProfile()
    if (!data) return
    startProfileTransition(async () => {
      const result = await attempt('save-buyer-profile', saveBuyerProfile({ ...data, locale }))
      if (!result.ok) {
        setProfileFormError(result.error)
        setProfileNotice(null)
        return
      }
      setProfileFormError(null)
      setProfileNotice('saved')
      setSavedProfile(data)
      setIsProfileDirty(false)
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
  /**
   * The six criteria that actually change the answer, parsed once per edit.
   *
   * `timelineMonths` and `notes` are deliberately absent: they live on the
   * mandate but not in `MandateCriteria` (`@/lib/matching`), so `scoreMatch`
   * never reads them and typing a note must not spend a round trip. The six
   * that remain are exactly `mandateCriteriaSchema`'s shape — the schema the
   * action validates against — so what this watches and what the server scores
   * cannot drift.
   *
   * `null` means the mandate cannot be scored yet: a ticket minimum above its
   * maximum, or an amount `readOptionalMoney` could not read. That is not an
   * error to raise here — the field already carries one — it just means no
   * request is worth making.
   */
  const criteria = useMemo(() => {
    const parsed = mandateCriteriaSchema.safeParse({
      categories,
      countries,
      licenceTypes,
      businessStatuses,
      ticketMinCents: readOptionalMoney(ticketMin),
      ticketMaxCents: readOptionalMoney(ticketMax),
    })
    return parsed.success ? parsed.data : null
  }, [categories, countries, licenceTypes, businessStatuses, ticketMin, ticketMax])

  /**
   * Identity of those six, or `null` while they cannot be scored.
   * `mandateCriteriaKey` (`@/lib/matching`) owns which fields participate, and
   * a test there holds it to every key of `MandateCriteria`.
   */
  const criteriaKey = criteria === null ? null : mandateCriteriaKey(criteria)

  /**
   * The criteria the number on screen was computed for — **state, not a ref**,
   * because the panel's dimming is derived from it and a ref would not
   * re-render.
   *
   * Initialised to the criteria this component mounted with, because the page
   * already counted those server-side (`countMandateMatches` in
   * `profile/page.tsx`); re-asking on mount would be a wasted full-catalogue
   * scan, and React's development double-invocation of effects would make a
   * plain "first run" flag fire one anyway.
   *
   * Comparing keys rather than counting runs also fixes the case a flag gets
   * wrong: a buyer who changes a criterion and changes it straight back must
   * get their original number restored. A flag would skip that second edit and
   * leave the intermediate count on screen — the one failure mode nobody
   * notices until the number is quietly wrong.
   */
  const [countedKey, setCountedKey] = useState(criteriaKey)

  /** The mandate as last written. Baseline for this section's unsaved marker. */
  const [savedMandate, setSavedMandate] = useState<MandateInput>(mandate)

  /**
   * Derived, not stored: every field of this section is React state already,
   * so the answer is a function of the current render and needs no effect.
   * Includes `timelineMonths` and `notes` — they do not affect matching, which
   * is why `criteriaKey` above excludes them, but they are absolutely part of
   * "have I saved my changes".
   */
  const isMandateDirty = useMemo(() => {
    const parsed = mandateSchema.safeParse(buildMandateValues())
    return !parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(savedMandate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildMandateValues reads exactly these
  }, [
    categories,
    countries,
    licenceTypes,
    businessStatuses,
    ticketMin,
    ticketMax,
    timelineEnabled,
    timelineMonths,
    notes,
    savedMandate,
  ])

  /**
   * Discards a reply whose request has been superseded. Every edit takes a new
   * ticket; an older one that arrives late is dropped rather than written.
   * Without it two edits in flight resolve in whatever order the network
   * chooses and the slower, older answer wins.
   */
  const recountTicket = useRef(0)

  /**
   * Derived, never assigned: "the number you are reading was computed for
   * something other than what is now selected". True through the debounce and
   * the round trip, and — deliberately — after a failed request, because the
   * count really is stale then. The next edit retries, and saving recomputes
   * authoritatively either way. Claiming freshness we do not have would be the
   * worse of the two.
   */
  const isRecounting = criteriaKey !== null && criteriaKey !== countedKey

  useEffect(() => {
    if (criteria === null || criteriaKey === null || criteriaKey === countedKey) return

    const ticket = (recountTicket.current += 1)
    // Long enough that toggling three chips in a row is one request rather
    // than three. Each call reads every published listing and scores it in
    // memory (`scoreMandateAgainstCatalog`, `@/server/actions/profile`), so
    // this is a real cost, not a formality.
    const timer = setTimeout(() => {
      void (async () => {
        const result = await attempt(
          'count-mandate-matches',
          countMandateMatches({ mandate: criteria, locale }),
        )
        if (ticket !== recountTicket.current || !result.ok) return
        setCountedKey(criteriaKey)
        setMatchSummary({
          matchCount: result.matchCount,
          totalListings: result.totalListings,
          specificity: result.specificity,
        })
      })()
    }, RECOUNT_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [criteria, criteriaKey, countedKey, locale])

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
        const key = mandateErrorKey(field as keyof MandateInput, issue.code)
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

  // Both sections at once: the guard asks "is there unsaved work on this
  // screen", not which card it is in. Which card is the marker's job, and it is
  // already answering that beside each button.
  useUnsavedChanges('buyer-profile-page', isProfileDirty || isMandateDirty)

  function handleSaveMandate() {
    const data = validateMandate()
    if (!data) return
    startMandateTransition(async () => {
      const result = await attempt('save-mandate', saveMandate({ ...data, locale }))
      if (!result.ok) {
        setMandateFormError(result.error)
        setMandateNotice(null)
        return
      }
      setMandateFormError(null)
      setMandateNotice('saved')
      // The save recomputed the same number against the same criteria, and its
      // answer is the authoritative one. Retiring the outstanding ticket stops
      // a live recount that is still in flight from landing on top of it, and
      // marks these criteria as counted so the effect does not immediately ask
      // again.
      recountTicket.current += 1
      setCountedKey(criteriaKey)
      setSavedMandate(data)
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
            // See `register-form.tsx`: this form validates through its own
            // schema, so the browser's constraint check must not pre-empt it.
            noValidate
            onSubmit={(event) => event.preventDefault()}
            // `onInput` bubbles, so one handler covers every control in the
            // section. The marker has to answer per keystroke; the red field
            // below deliberately waits for `onBlur`, because flagging a name
            // as empty while it is being retyped is nagging, not help.
            onInput={recomputeProfileDirty}
            onBlur={revalidateProfileFields}
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isProfilePending}
                aria-describedby={isProfileDirty ? profileUnsavedId : undefined}
                onClick={handleSaveProfile}
              >
                {isProfilePending ? t('actions.saving') : t('actions.saveProfile')}
              </Button>
              {isProfileDirty ? (
                <UnsavedMarker id={profileUnsavedId} label={t('actions.unsaved')} />
              ) : null}
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
            {profileNotice === 'saved' && !isProfileDirty ? (
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
            aria-busy={isRecounting}
            className={cn(
              'rounded-md border px-4 py-3 text-sm text-ink transition-opacity',
              matchSummary.specificity === 0
                ? 'border-warning/40 bg-warning/10'
                : 'border-accent/30 bg-accent/10',
              // Dimmed rather than blanked or spinner-ed: the previous count
              // stays readable while the next one is computed, so the panel
              // never flashes empty on a criterion the buyer is still editing.
              isRecounting && 'opacity-60',
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
            noValidate
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={isMandatePending}
                aria-describedby={isMandateDirty ? mandateUnsavedId : undefined}
                onClick={handleSaveMandate}
              >
                {isMandatePending ? t('actions.saving') : t('actions.saveMandate')}
              </Button>
              {isMandateDirty ? (
                <UnsavedMarker id={mandateUnsavedId} label={t('actions.unsaved')} />
              ) : null}
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
            {mandateNotice === 'saved' && !isMandateDirty ? (
              <p className="text-sm text-success">{t('mandate.savedNotice')}</p>
            ) : null}
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
