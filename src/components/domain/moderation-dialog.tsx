'use client'

import { useActionState, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import {
  MAX_MODERATION_REASON,
  MIN_MODERATION_REASON,
  isValidModerationReason,
} from '@/lib/validation/moderation'
import type { ActionResult } from '@/server/actions/types'
import { attempt } from '@/lib/action-result'

/** The `name` the reason travels under, read back out of the `FormData`. */
const REASON_FIELD = 'reason'

/**
 * The one gate every destructive action on the console passes through: it
 * states the consequence in plain language, collects the mandatory reason,
 * and only then lets the manager confirm.
 *
 * **Generic on purpose.** It knows nothing about users, listings or the four
 * Server Actions — the caller passes a `onConfirm` that closes over whichever
 * action and target it means, and every string arrives already translated by
 * the table that owns the row. That is what lets one component serve
 * suspend/reinstate/remove on the participants tab and approve/reject/suspend
 * on the listings tab without a `kind` prop and six branches inside it. It
 * works because both tables are themselves client components, so passing a
 * function across the boundary is an ordinary closure, not a serialised
 * Server Function reference.
 *
 * The reason rule is `@/lib/validation/moderation`'s, not a second copy: the
 * confirm button enables on exactly the input the Server Action will accept,
 * so the form can never look ready for something the server rejects. The
 * server still validates — this is the courtesy, not the check.
 *
 * A native `<dialog>` opened with `showModal()`, rather than a hand-rolled
 * overlay: focus trapping, the Escape key, inertness of the page behind it
 * and the backdrop are all behaviour the platform already has and a
 * from-scratch modal in this codebase would have to reimplement (and would
 * get wrong first). Its one requirement is imperative control — `open` as a
 * React prop renders a *non-modal* dialog — hence the ref.
 */
export function ModerationDialog({
  triggerLabel,
  triggerVariant = 'secondary',
  title,
  consequence,
  confirmLabel,
  pendingLabel,
  confirmVariant = 'danger',
  onConfirm,
}: {
  /** Already-translated label for the button that opens the dialog. */
  triggerLabel: string
  triggerVariant?: ButtonVariant
  /** Already-translated dialog heading, naming the action and the target. */
  title: string
  /** Already-translated plain-language statement of what confirming will do. */
  consequence: string
  confirmLabel: string
  pendingLabel: string
  confirmVariant?: ButtonVariant
  /** Runs the action with the reason the manager typed. */
  onConfirm: (reason: string) => Promise<ActionResult>
}) {
  const t = useTranslations('admin.dialog')
  const tCommon = useTranslations('common')
  const tError = useTranslations('admin.error')

  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const reasonId = useId()
  const hintId = useId()
  const [reason, setReason] = useState('')

  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => {
      const result = await attempt(
        'moderate',
        onConfirm(String(formData.get(REASON_FIELD) ?? '')),
      )
      // Closed here rather than in an effect watching `state`: a successful
      // action revalidates, which may re-render this row with different
      // buttons or remove it, and an effect would then be racing an unmount
      // to close a dialog that is already gone. The reason is cleared with
      // it, so reopening the dialog on the next row does not inherit the
      // last one's text.
      if (result.ok) {
        setReason('')
        dialogRef.current?.close()
      }
      return result
    },
    null,
  )

  const canConfirm = isValidModerationReason(reason) && !isPending

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={triggerVariant}
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-0 text-ink backdrop:bg-black/60"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p className="text-sm text-ink-muted">{consequence}</p>

          <Field label={t('reasonLabel')} htmlFor={reasonId}>
            <textarea
              id={reasonId}
              name={REASON_FIELD}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              maxLength={MAX_MODERATION_REASON}
              aria-describedby={hintId}
              className="field-control resize-y"
            />
          </Field>
          <p id={hintId} className="text-xs text-ink-muted">
            {t('reasonHint', { min: MIN_MODERATION_REASON })}
          </p>

          {state && !state.ok ? (
            <p role="alert" className="text-xs text-danger">
              {tError(state.error)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {/* `disabled` is the real gate — the `disabled:` classes on
                `Button` are styling and say nothing about the attribute. */}
            <Button type="submit" size="sm" variant={confirmVariant} disabled={!canConfirm}>
              {isPending ? pendingLabel : confirmLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
