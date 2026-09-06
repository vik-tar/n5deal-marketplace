import { describe, expect, it } from 'vitest'
import { groupByOrder } from '@/lib/group'

interface Row {
  id: string
  status: 'A' | 'B' | 'C'
}

const rows: Row[] = [
  { id: '1', status: 'B' },
  { id: '2', status: 'A' },
  { id: '3', status: 'B' },
  { id: '4', status: 'C' },
]

const keyOf = (row: Row) => row.status

describe('groupByOrder', () => {
  it('emits groups in the order given, not in the order the rows arrived', () => {
    const groups = groupByOrder(rows, keyOf, ['C', 'A', 'B'])
    expect(groups.map((g) => g.key)).toEqual(['C', 'A', 'B'])
  })

  it('keeps the input order of rows inside each group', () => {
    const groups = groupByOrder(rows, keyOf, ['B', 'A', 'C'])
    expect(groups[0]!.items.map((row) => row.id)).toEqual(['1', '3'])
  })

  it('drops groups that would be empty rather than emitting an empty heading', () => {
    const groups = groupByOrder(
      [{ id: '1', status: 'A' } satisfies Row],
      keyOf,
      ['A', 'B', 'C'],
    )
    expect(groups).toEqual([{ key: 'A', items: [{ id: '1', status: 'A' }] }])
  })

  it('returns nothing at all for no rows', () => {
    expect(groupByOrder([], keyOf, ['A', 'B', 'C'])).toEqual([])
  })

  /**
   * The silent-data-loss guard: a key the caller forgot to list must still
   * reach the page. Both real callers pass an exhaustive order constant, so
   * this only fires if a Prisma enum gains a member and the order constant is
   * not updated with it.
   */
  it('appends keys missing from the order, in first-seen order, rather than dropping them', () => {
    const groups = groupByOrder(rows, keyOf, ['A'])
    expect(groups.map((g) => g.key)).toEqual(['A', 'B', 'C'])
    expect(groups[1]!.items.map((row) => row.id)).toEqual(['1', '3'])
  })

  it('emits a duplicated order entry once', () => {
    const groups = groupByOrder(rows, keyOf, ['B', 'B', 'A'])
    expect(groups.map((g) => g.key)).toEqual(['B', 'A', 'C'])
  })
})
