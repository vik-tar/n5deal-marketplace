import { redirect } from '@/i18n/navigation'
import { auth } from '@/auth'
import type { Viewer } from '@/lib/authz'

/**
 * The session is a JWT, so `status` is a snapshot from sign-in time.
 * Re-reading it here means a manager's suspension takes effect on the
 * suspended user's very next request rather than at their next sign-in.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  const { prisma } = await import('@/server/db')
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { buyerProfile: { select: { id: true } }, sellerProfile: { select: { id: true } } },
  })
  if (!user || user.status === 'REMOVED') return null

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    buyerProfileId: user.buyerProfile?.id ?? null,
    sellerProfileId: user.sellerProfile?.id ?? null,
  }
}

/**
 * `redirect()`'s declared return type is `never` — it always throws — but
 * that type does not survive far enough through `createNavigation`'s generics
 * for `tsc` to treat a bare call to it as unreachable, so `viewer` below would
 * stay typed `Viewer | null` after the guard clauses. This wrapper's own
 * explicit `never` annotation fixes the narrowing without changing behaviour.
 */
function redirectNow(href: '/login' | '/suspended', locale: string): never {
  redirect({ href, locale })
  throw new Error('unreachable: redirect() always throws')
}

export async function requireViewer(locale: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (viewer === null) redirectNow('/login', locale)
  if (viewer.status !== 'ACTIVE') redirectNow('/suspended', locale)
  return viewer
}
