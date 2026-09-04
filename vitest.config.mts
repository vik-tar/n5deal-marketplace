import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // Unlike `next dev`/`next build` (which load `.env` automatically via
    // `@next/env`), a bare `vitest` process does not populate `process.env`
    // from `.env` at all. `src/server/db.ts` constructs the Prisma client
    // eagerly at module load — reading `DATABASE_URL` the moment anything
    // imports it, even transitively (e.g. `tests/unit/queries/asset-where.test.ts`
    // importing `buildWhere` from `@/server/queries/assets`) — so without this,
    // any such test fails the whole file before a single test body runs.
    setupFiles: ['dotenv/config'],
  },
})
