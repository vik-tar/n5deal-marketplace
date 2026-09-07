'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { attempt } from '@/lib/action-result'
import { BUYER_TYPES } from '@/lib/filters/buyer-filters'
import { COUNTRY_CODE_LENGTH } from '@/lib/validation/primitives'
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  SELF_SERVICE_ROLES,
  registrationSchema,
  type SelfServiceRole,
} from '@/lib/validation/registration'
import { registerAccount, type RegisterError } from '@/server/actions/registration'

/**
 * Sign-up for the two roles a stranger may hold. There is no `MANAGER` option
 * and no way to ask for one — `registrationSchema` has no such member, so the
 * absence is structural rather than a control this form happens not to render.
 *
 * The role is a real radio group rather than a `<select>`: it changes which
 * fields appear below it, and a control that rewrites the form under you should
 * be visible in full rather than hidden behind a click.
 *
 * Field errors are keyed off the same schema the action enforces, so the
 * inline message and the refusal cannot disagree. Validation runs on blur as
 * well as on submit, following `MandateForm` — an empty required field turns
 * red when you leave it, not when you finally reach the button.
 */
type FieldErrors = Partial<Record<string, string>>

const FIELD_ERROR_KEY: Record<string, string> = {
  email: 'email',
  password: 'password',
  country: 'country',
  displayName: 'required',
  companyName: 'required',
  contactName: 'required',
  buyerType: 'required',
}

export function RegisterForm({ locale }: { locale: string }) {
  const t = useTranslations('register')
  const tProfile = useTranslations('profile')
  const formRef = useRef<HTMLFormElement>(null)
  const [role, setRole] = useState<SelfServiceRole>('BUYER')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<RegisterError | 'CLIENT_INVALID' | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * Nothing is marked wrong until the form has been submitted once.
   *
   * Validating on blur from the first keystroke means a field goes red for
   * being incomplete while it is still being filled in — the email is not an
   * email yet on its way to becoming one. Submitting is the moment the user
   * says "I think this is done", and that is the moment to disagree with them.
   *
   * After that first submit the errors do stay live, clearing on blur as each
   * field is fixed, because a list of complaints that only updates when you
   * press the button again makes you guess whether the fix worked.
   */
  const [hasSubmitted, setHasSubmitted] = useState(false)

  /**
   * The address the server has already refused as taken, or `null`.
   *
   * Kept as the **value**, not as a flag, because that is what the refusal is
   * about. The schema considers `someone@example.com` perfectly valid — it
   * cannot know who else holds it — so a plain `fieldErrors.email` would be
   * wiped by the next blur while the address was still the taken one, and the
   * field would go quietly green under a form that still cannot be submitted.
   * Comparing values instead means the message survives every revalidation
   * until the address actually changes, and clears by itself the moment it
   * does.
   */
  const [takenEmail, setTakenEmail] = useState<string | null>(null)

  function readValues(form: HTMLFormElement): Record<string, unknown> {
    const data = new FormData(form)
    const str = (name: string) => String(data.get(name) ?? '').trim()
    const shared = { email: str('email'), password: String(data.get('password') ?? ''), country: str('country') }
    return role === 'BUYER'
      ? { role, ...shared, displayName: str('displayName'), buyerType: str('buyerType') }
      : { role, ...shared, companyName: str('companyName'), contactName: str('contactName') }
  }

  /**
   * `taken` is passed rather than read from state so the caller can supply the
   * address the server has just refused: `setTakenEmail` has not landed yet at
   * the moment its own error needs rendering.
   */
  function issuesFor(form: HTMLFormElement, taken: string | null = takenEmail): FieldErrors {
    const values = readValues(form)
    const result = registrationSchema.safeParse(values)
    const errors: FieldErrors = {}

    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field !== 'string' || field in errors) continue
        errors[field] = t(`errors.${FIELD_ERROR_KEY[field] ?? 'required'}`)
      }
    }

    // Lower-cased on both sides, matching how the schema normalises an address
    // before it is stored: retyping the same account in a different case is
    // still the same account, and must still be refused.
    const email = String(values.email ?? '').toLowerCase()
    if (errors.email === undefined && taken !== null && email === taken) {
      errors.email = t('error.EMAIL_TAKEN')
    }

    return errors
  }

  function revalidate(): void {
    if (!hasSubmitted) return
    const form = formRef.current
    if (!form) return
    setFieldErrors(issuesFor(form))
  }

  function handleSubmit(): void {
    const form = formRef.current
    if (!form) return
    setHasSubmitted(true)

    // Every submit re-validates, and an invalid one stops here — the account
    // action is never called, on the first attempt or the fifth.
    const parsed = registrationSchema.safeParse(readValues(form))
    if (!parsed.success) {
      setFieldErrors(issuesFor(form))
      setFormError('CLIENT_INVALID')
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      const result = await attempt('register', registerAccount({ input: parsed.data, locale }))
      // A success never resolves here: the action signs the new user in, which
      // redirects. Anything that does resolve is a refusal.
      if (result.ok) return

      // A taken address is a complaint about one field, so it is shown on that
      // field rather than as a sentence under the button the user has to
      // connect back to an input by themselves. The others — `FORBIDDEN`,
      // `INVALID`, `UNEXPECTED` — are about the request as a whole and have no
      // field to sit on.
      if (result.error === 'EMAIL_TAKEN') {
        setTakenEmail(parsed.data.email)
        setFieldErrors(issuesFor(form, parsed.data.email))
        setFormError(null)
        return
      }

      setFormError(result.error)
    })
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      // `noValidate`: this form owns its validation. Without it the browser's
      // own constraint check runs first, refuses to submit a malformed
      // `type="email"`, and shows an untranslated bubble — so the schema below
      // never runs and none of the styled, localised field errors appear.
      // Measured: a bad address produced no `aria-invalid`, no message, and no
      // submit at all.
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
      onBlur={revalidate}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="meta-label mb-1">{t('fields.roleLabel')}</legend>
        <div className="flex flex-wrap gap-4">
          {SELF_SERVICE_ROLES.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="role"
                value={option}
                checked={role === option}
                onChange={() => {
                  // The fields below are replaced wholesale, so complaints
                  // about the old ones are about controls that no longer
                  // exist. Submitting again is what re-earns them.
                  setRole(option)
                  setFieldErrors({})
                  setFormError(null)
                  setHasSubmitted(false)
                }}
                className="size-4 accent-accent"
              />
              {t(`role.${option}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">{t('fields.roleHint')}</p>
      </fieldset>

      <Field label={t('fields.emailLabel')} htmlFor="email" error={fieldErrors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={MAX_EMAIL_LENGTH}
          className="field-control"
        />
      </Field>

      <Field label={t('fields.passwordLabel')} htmlFor="password" error={fieldErrors.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="field-control"
        />
      </Field>
      <p className="-mt-2 text-xs text-ink-muted">
        {t('fields.passwordHint', { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES })}
      </p>

      {role === 'BUYER' ? (
        <>
          <Field
            label={t('fields.displayNameLabel')}
            htmlFor="displayName"
            error={fieldErrors.displayName}
          >
            <input id="displayName" name="displayName" maxLength={MAX_NAME_LENGTH} className="field-control" />
          </Field>
          <Field label={t('fields.buyerTypeLabel')} htmlFor="buyerType" error={fieldErrors.buyerType}>
            <select id="buyerType" name="buyerType" defaultValue={BUYER_TYPES[0]} className="field-control">
              {BUYER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tProfile(`buyerType.${type}`)}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field
            label={t('fields.companyNameLabel')}
            htmlFor="companyName"
            error={fieldErrors.companyName}
          >
            <input id="companyName" name="companyName" maxLength={MAX_NAME_LENGTH} className="field-control" />
          </Field>
          <Field
            label={t('fields.contactNameLabel')}
            htmlFor="contactName"
            error={fieldErrors.contactName}
          >
            <input id="contactName" name="contactName" maxLength={MAX_NAME_LENGTH} className="field-control" />
          </Field>
        </>
      )}

      <Field label={t('fields.countryLabel')} htmlFor="country" error={fieldErrors.country}>
        <input
          id="country"
          name="country"
          maxLength={COUNTRY_CODE_LENGTH}
          placeholder={t('fields.countryPlaceholder')}
          className="field-control uppercase"
        />
      </Field>

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? t('submitting') : t('submit')}
        </Button>
      </div>

      {formError !== null ? (
        <p role="alert" className="text-sm text-danger">
          {formError === 'CLIENT_INVALID' ? t('errors.form') : t(`error.${formError}`)}
        </p>
      ) : null}
    </form>
  )
}
