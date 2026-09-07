import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    /**
     * Deliberately `process.env.DATABASE_URL` and **not** Prisma's `env()`
     * helper. `env()` enforces resolution at config-load time, so it throws
     * before any command runs when the variable is unset — including
     * `prisma generate`, which needs no connection at all. That would make
     * `package.json`'s `postinstall` (`prisma generate`, required because
     * `src/generated/` is git-ignored and Vercel's build machine has no
     * client otherwise) fail on a fresh `git clone && pnpm i`, before anyone
     * has had the chance to write a `.env`.
     *
     * Read this way, `prisma generate` succeeds with no `DATABASE_URL`
     * (optional for it since Prisma 7.2), while every command that genuinely
     * needs a database still refuses by name: `prisma migrate status` with no
     * URL exits 1 with "The datasource.url property is required in your
     * Prisma config file". The application's own fail-fast guard is
     * unaffected and lives in `src/server/db.ts`.
     */
    url: process.env.DATABASE_URL,
  },
})
