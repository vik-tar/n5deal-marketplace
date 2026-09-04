'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { requestAccess } from '@/server/actions/access-requests'
import type { ActionResult } from '@/server/actions/types'

/** Disables the button and swaps its label while its own form is submitting. */
function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

/**
 * The Requestable state's real control (Task 14), replacing the disabled
 * placeholder button Task 13 left in `GatedSection`. This is the one client
 * island inside an otherwise server-rendered gate — mirroring how
 * `demo-login.tsx` is the one client piece of the otherwise server-rendered
 * login page.
 *
 * The form's action is a plain client wrapper around the real
 * `requestAccess` Server Action, not `requestAccess` bound directly: ruling
 * 2 (Task 14) has every action take `locale` as part of a single typed input
 * object, which does not match the `(formData: FormData)` shape a `<form
 * action>` calls directly. The wrapper builds that exact payload from the
 * one form field (`message`) plus the props already in scope (`assetId`,
 * `locale`) and calls the real action — the server-side authorization check
 * inside `requestAccess` runs exactly the same either way; nothing here
 * decides anything, it only shapes the call.
 */
export function RequestAccessForm({ assetId, locale }: { assetId: string; locale: string }) {
  const t = useTranslations('gate.requestable')

  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (_prevState, formData) => {
    const message = String(formData.get('message') ?? '')
    return requestAccess({ assetId, message, locale })
  }, null)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="access-request-message" className="meta-label">
          {t('messageLabel')}
        </label>
        <textarea
          id="access-request-message"
          name="message"
          rows={3}
          maxLength={1000}
          placeholder={t('messagePlaceholder')}
          className="field-control"
        />
      </div>
      <div>
        <SubmitButton label={t('action')} pendingLabel={t('submitting')} />
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-xs text-danger">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
    </form>
  )
}
