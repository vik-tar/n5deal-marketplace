import { defineConfig, devices } from '@playwright/test'

/**
 * The end-to-end suite: three flows, one per role, each asserting a state
 * change no unit test can reach because it spans a sign-in, a Server Action,
 * a revalidation and a second viewer's session.
 *
 * **This is a separate runner from `pnpm test` on purpose.** `vitest.config.mts`
 * includes only `tests/unit/**` and the unit suite must keep passing with
 * `DATABASE_URL` unset — a property that has held for 21 tasks. Nothing here
 * is wired into vitest, and nothing under `tests/e2e` is importable by it.
 *
 * **The suite mutates the shared development database by design.** `globalSetup`
 * reseeds it before the first test and `globalTeardown` reseeds it again after
 * the last one, so the database is left exactly as `pnpm db:seed` produces it
 * (19 users, 40 assets, 7 access requests, 34 listings clearing the visibility
 * floor) whichever way the run ends. See `resetDb` in `tests/e2e/helpers.ts`
 * for why the seed alone, and not `prisma migrate reset`, is what does it.
 */
export default defineConfig({
  testDir: './tests/e2e',

  /**
   * One worker, no parallelism, in file order.
   *
   * `fullyParallel: false` alone only serialises tests *within* a file —
   * separate files still get separate workers, and these three specs share one
   * database. The manager spec suspends an account, which hides that seller's
   * listings from the catalog globally; the seller spec publishes a listing
   * through the same moderation console. Run concurrently they would read each
   * other's half-applied state. `workers: 1` is what actually forbids that.
   */
  fullyParallel: false,
  workers: 1,

  /**
   * No retries, deliberately. A retry here would turn a real race — of which
   * this codebase has already found two — into an intermittently green suite.
   * If a step is slow, it waits on a visible assertion; there is no
   * `waitForTimeout` anywhere in this directory.
   */
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',

  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      // The bundled Chromium build, not `channel: 'chrome'`:
      // `pnpm exec playwright install chromium` downloaded cleanly in this
      // environment, so CI needs only that command and no system browser.
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // A production build, not `next dev`: the flows depend on Server Actions,
    // `revalidatePath` and the RSC payload behaving the way they will in
    // production, and `next dev`'s compile-on-first-request would put a
    // multi-second stall in front of every first navigation.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    // Auth.js rejects a request whose host it does not trust with
    // `UntrustedHost` as soon as the server is not on the origin it inferred.
    // Irrelevant on Vercel, required for a local production build.
    env: { AUTH_TRUST_HOST: 'true' },
    reuseExistingServer: !process.env.CI,
    // `pnpm build` is inside the command, so this budget covers a cold
    // Next build as well as the server's own start-up.
    timeout: 300_000,
  },
})
