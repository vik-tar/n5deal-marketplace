import type { DefaultSession } from 'next-auth'
import type { Role, UserStatus } from '@/generated/prisma/client'

/**
 * The credentials `authorize()` returns (see `@/auth`) and what the `jwt`
 * callback reads off it. `id` is made required here — `DefaultUser.id` is
 * optional, but `authorize` always supplies one.
 */
declare module 'next-auth' {
  interface User {
    id: string
    role: Role
    status: UserStatus
    buyerProfileId: string | null
    sellerProfileId: string | null
  }

  interface Session {
    user: {
      id: string
      role: Role
      status: UserStatus
      buyerProfileId: string | null
      sellerProfileId: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    status: UserStatus
    buyerProfileId: string | null
    sellerProfileId: string | null
  }
}
