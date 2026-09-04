import NextAuth from 'next-auth'
import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db'

/**
 * A real bcrypt hash of a value nobody can supply, computed once at module
 * load. `authorize` below always runs exactly one `bcrypt.compare` — against
 * either the looked-up user's real hash, or this one when there is no
 * usable account — so "no such account" / "removed account" and "wrong
 * password for a real account" cost the same amount of work, and therefore
 * the same amount of time. The uniform `login.error` message is backed by
 * uniform timing: a caller cannot enumerate which addresses have accounts by
 * measuring how long a failed attempt takes.
 */
const DUMMY_HASH = bcrypt.hashSync('no account will ever use this password', 10)

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').toLowerCase().trim()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const user = await prisma.user.findUnique({
          where: { email },
          include: { buyerProfile: true, sellerProfile: true },
        })

        // Always compare against *something* — the real hash when there is a
        // usable account, `DUMMY_HASH` otherwise — so this line runs the same
        // work regardless of which failure (if any) is about to be returned.
        const ok = await bcrypt.compare(
          password,
          user && user.status !== 'REMOVED' ? user.passwordHash : DUMMY_HASH,
        )
        if (!user || user.status === 'REMOVED' || !ok) return null

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          buyerProfileId: user.buyerProfile?.id ?? null,
          sellerProfileId: user.sellerProfile?.id ?? null,
        }
      },
    }),
  ],
  callbacks: {
    // Explicitly typed rather than left to inference: re-verified on 2026-09-04
    // (fix round 1) by stripping these annotations and running a clean
    // `pnpm typecheck` (tsconfig.tsbuildinfo removed first, so nothing was
    // cached) — the exact `TS2322: Type 'unknown' is not assignable to type
    // '...'` errors returned on these five lines, unchanged from the original
    // finding. Keeping the annotations; see task-11-report.md for the full
    // repro output.
    jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.status = user.status
        token.buyerProfileId = user.buyerProfileId
        token.sellerProfileId = user.sellerProfileId
      }
      return token
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.status = token.status
      session.user.buyerProfileId = token.buyerProfileId
      session.user.sellerProfileId = token.sellerProfileId
      return session
    },
  },
})

// A suspended user still receives a session — they must be able to see *why*
// they are locked out (see `/suspended`). Only `REMOVED` is refused outright,
// above, at `authorize`.
