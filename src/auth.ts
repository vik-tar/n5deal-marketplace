import NextAuth from 'next-auth'
import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db'

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
        if (!user) return null
        if (user.status === 'REMOVED') return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

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
    // Explicitly typed rather than left to inference: `NextAuth`'s config
    // parameter is a union (a plain object or a function returning one), and
    // through that union TypeScript's contextual typing collapses these two
    // callbacks' destructured `token`/`session` down to their un-augmented
    // base shape (`token.role` etc. read back as `unknown`) even though the
    // module augmentation in `src/types/next-auth.d.ts` is in effect and
    // `JWT`/`Session` resolve correctly everywhere else. Annotating the
    // parameters directly sidesteps that inference gap.
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
