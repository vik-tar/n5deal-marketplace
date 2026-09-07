'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { startConversation, type StartConversationTarget } from '@/server/actions/messages'
import type { ContactAvailability } from '@/lib/authz'
import type { ActionError } from '@/server/actions/types'

/**
 * The one control that opens a thread, used from both sides of the market:
 * "Contact seller" on a listing (`target.kind === 'asset'`) and "Contact
 * buyer" on a buyer profile (`target.kind === 'buyer'`). The label follows
 * the target rather than a separate prop, so the two entry points cannot
 * drift into saying different things about the same action.
 *
 * `availability` is decided server-side — `AssetDetail.canContactSeller`
 * (`@/server/queries/assets`) and `BuyerDetail.canContact`
 * (`@/server/queries/buyers`), both of which now call the one
 * `contactAvailability` predicate (`@/lib/authz`) and answer "would
 * `startConversation` accept this?" rather than the looser "may this viewer
 * message anyone". This component does not re-derive it; it presents the
 * answer and explains it.
 *
 * The button is rendered **disabled, never omitted**, when the answer is no
 * (Task 17's shape, kept): a manager, or a viewer looking at a suspended
 * counterparty, sees why the action is unavailable instead of a missing
 * control they would reasonably assume is a bug.
 *
 * The explanation is one string per reason, because a single one was wrong
 * for most of them. Until the whole-branch review every refusal printed
 * "This account cannot be messaged", which a manager reads as a claim about
 * the person they are looking at (false — managers moderate rather than
 * transact), a seller on a listing reads the same way (also false — they
 * simply hold no `BuyerProfile` and cannot be the buyer side of that
 * thread), and only a genuinely suspended counterparty reads correctly. The
 * remedies differ per reason, so the copy has to as well: sign in, appeal
 * your own suspension, or nothing at all.
 *
 * `isAnonymous` is gone with it — `'SIGN_IN'` is one of the reasons, so the
 * caller no longer passes the same fact twice in two shapes.
 *
 * On success the action returns the thread's id and this navigates into it,
 * exactly as `listing-form.tsx` navigates to the edit page for the listing
 * `saveDraft` just created. Nothing here decides anything: the same
 * authorization runs inside `startConversation` whether this button is
 * disabled or not.
 */
export function ContactButton({
  target,
  availability,
  locale,
}: {
  target: StartConversationTarget
  availability: ContactAvailability
  locale: string
}) {
  const t = useTranslations('contact')
  const router = useRouter()
  const [error, setError] = useState<ActionError | null>(null)
  const [isPending, startTransition] = useTransition()
  const canContact = availability === 'ALLOWED'

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startConversation({ target, locale })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/inbox/${result.conversationId}`)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={!canContact || isPending}
          onClick={handleClick}
        >
          {isPending ? t('opening') : t(target.kind === 'asset' ? 'seller' : 'buyer')}
        </Button>
      </div>
      {!canContact ? (
        <p className="text-xs text-ink-muted">
          {t(`unavailable.${availability}`, { target: target.kind })}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-xs text-danger">
          {t(`error.${error}`)}
        </p>
      ) : null}
    </div>
  )
}
