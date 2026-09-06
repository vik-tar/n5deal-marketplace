/**
 * One grouping rule, used by both dashboards.
 *
 * Pure: no database, no fetch, no environment — the same rationale
 * `@/lib/nav` and `@/lib/gate` document for living here rather than inside
 * the component or query that happens to need them first. Two surfaces group
 * a flat list of rows into ordered, status-labelled sections (a seller's
 * listings by `AssetStatus`, a buyer's access requests by `AccessStatus`),
 * and the only thing that differs between them is which order the sections
 * come in — so the algorithm is written once and each caller supplies its own
 * order constant.
 */

export interface Group<K extends string, T> {
  key: K
  items: T[]
}

/**
 * Groups `items` by `keyOf`, emitting the groups in `order` and dropping the
 * groups that would be empty — a seller with no rejected listings gets no
 * "Rejected" heading rather than an empty one.
 *
 * Within a group, items keep the order they arrived in, so the caller's own
 * sort (or its query's `orderBy`) is what decides row order; this function
 * never reorders rows, only sections.
 *
 * A key that is not in `order` is appended after the ordered groups, in the
 * order it was first seen, rather than dropped. Both current callers pass an
 * exhaustive order constant so that tail is unreachable today — it exists
 * because the alternative failure mode is silent data loss: a Prisma enum
 * gaining a member would otherwise make rows vanish from a dashboard with no
 * type error and nothing on screen to notice.
 */
export function groupByOrder<K extends string, T>(
  items: readonly T[],
  keyOf: (item: T) => K,
  order: readonly K[],
): Group<K, T>[] {
  const buckets = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }

  const groups: Group<K, T>[] = []
  for (const key of order) {
    const bucket = buckets.get(key)
    if (bucket === undefined) continue
    groups.push({ key, items: bucket })
    // Deleted so the leftover pass below cannot emit the same key twice if
    // `order` itself contains a duplicate.
    buckets.delete(key)
  }
  for (const [key, items] of buckets) {
    groups.push({ key, items })
  }
  return groups
}
