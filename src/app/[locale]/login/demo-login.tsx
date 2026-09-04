'use client'

import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { signInAction } from '@/server/actions/auth'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../../../prisma/seed-data/participants'

type DemoRole = 'buyer' | 'seller' | 'manager'

const ROLES: DemoRole[] = ['buyer', 'seller', 'manager']

/** Keys into the `login` message namespace, one per demo role. */
const LABEL_KEY: Record<DemoRole, 'demoBuyer' | 'demoSeller' | 'demoManager'> = {
  buyer: 'demoBuyer',
  seller: 'demoSeller',
  manager: 'demoManager',
}

/** Disables the button and swaps its label while its own form is submitting. */
function DemoButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-full">
      {children}
    </Button>
  )
}

/**
 * One-click sign-in for each of the three demo roles, plus the same
 * credentials shown as text so a reviewer can also sign in by hand. Every
 * button posts to the identical `signInAction` the manual form below uses —
 * only the (hidden) `email`/`password` values differ.
 */
export function DemoLogin({ locale }: { locale: string }) {
  const t = useTranslations('login')
  const boundSignIn = signInAction.bind(null, locale)

  return (
    <div className="flex flex-col gap-3">
      <p className="meta-label">{t('demoHeading')}</p>
      <p className="text-sm text-ink-muted">{t('demoHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <form key={role} action={boundSignIn} className="flex flex-col gap-1.5">
            <input type="hidden" name="email" value={DEMO_ACCOUNTS[role]} />
            <input type="hidden" name="password" value={DEMO_PASSWORD} />
            <DemoButton>{t(LABEL_KEY[role])}</DemoButton>
            <p className="text-xs break-all text-ink-muted">
              {DEMO_ACCOUNTS[role]}
              <br />
              {DEMO_PASSWORD}
            </p>
          </form>
        ))}
      </div>
    </div>
  )
}
