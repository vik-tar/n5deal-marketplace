import { resetDb } from './helpers'

/**
 * Runs once before the whole suite. The three specs share one database and
 * each one mutates it, so they start from the seed rather than from whatever
 * the last `pnpm dev` session left behind.
 *
 * Destructive by design — this is the development database on the local
 * Docker Postgres, and the seed is fully reproducible.
 */
export default function globalSetup(): void {
  resetDb()
}
