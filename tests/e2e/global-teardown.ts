import { seedDb } from './helpers'

/**
 * Runs once after the whole suite, pass or fail, and puts the database back
 * into its seeded state.
 *
 * `globalSetup` alone would leave the last run's mutations in place — a
 * published listing the seller spec created, an approved access request the
 * buyer spec filed — until the *next* run reset them. Anyone opening
 * `pnpm dev` in between would be looking at a database the seed does not
 * describe, so the suite cleans up after itself rather than only before
 * itself.
 */
export default function globalTeardown(): void {
  seedDb()
}
