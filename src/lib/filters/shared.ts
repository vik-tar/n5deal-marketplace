export type RawSearchParams = Record<string, string | string[] | undefined>

export const PAGE_SIZE = 12

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
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

/** Reads a whole-euro query parameter and returns integer cents. */
export function toCents(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
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
