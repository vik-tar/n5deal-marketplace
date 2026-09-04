export type RawSearchParams = Record<string, string | string[] | undefined>

export const PAGE_SIZE = 12

/** Largest page number the catalog will honour, bounding pagination arithmetic. */
export const MAX_PAGE = 10_000

/** Largest filter bound the catalog will honour: €10 billion, in cents. */
export const MAX_FILTER_CENTS = 1_000_000_000_000

/** Accepts both `?k=a,b` and `?k=a&k=b`, deduplicating the result. */
export function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const parts = Array.isArray(value) ? value : value.split(',')
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))]
}

/** Keeps only members of the allowed set, preserving input order. */
export function keepKnown<T extends string>(
  values: string[],
  allowed: readonly T[],
): T[] {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v))
}

export function toPositiveInt(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) return fallback
  return parsed
}

/**
 * Reads a whole-euro query parameter and returns integer cents.
 *
 * The upper bound is not cosmetic. These values are handed to Prisma as
 * `BigInt` for the money columns, and `BigInt()` on an integer-valued but
 * unsafe double does not throw — it silently returns a different number
 * (`BigInt(1e23)` is 99999999999999991611392). Rejecting here is the only
 * place the problem is still visible.
 */
export function toCents(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  const cents = Math.round(parsed * 100)
  if (!Number.isSafeInteger(cents) || cents > MAX_FILTER_CENTS) return null
  return cents
}

export function toCountryCodes(value: string | string[] | undefined): string[] {
  return [
    ...new Set(
      toList(value)
        .map((c) => c.toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ]
}
