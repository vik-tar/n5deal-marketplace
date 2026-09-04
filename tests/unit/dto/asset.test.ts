import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import type { Asset } from '@/generated/prisma/client'
import {
  CONFIDENTIAL_ASSET_FIELDS,
  PUBLIC_ASSET_FIELDS,
  isFullAsset,
  toAssetDto,
  toTeaserAsset,
} from '@/lib/dto/asset'

const sample: Asset = {
  id: 'a-1',
  publicRef: 'N5-750',
  sellerProfileId: 'sp-1',
  status: 'PUBLISHED',
  category: 'EMI',
  licenceType: 'SEMI',
  businessType: 'Payments',
  country: 'MT',
  regulator: 'MFSA',
  businessStatus: 'ACTIVE',
  // BigInt literal syntax (`1_000_000_00n`) needs `target >= ES2020`; this
  // project's tsconfig targets ES2017 (Next.js's default), so `BigInt(...)`
  // calls are used instead — same values, syntax the configured target accepts.
  askingPriceCents: BigInt(1_000_000_00),
  employees: 14,
  yearOfIssue: 2019,
  included: ['Staff', 'Software'],
  teaserTitle: 'Maltese EMI with live portfolio',
  teaserDescription: 'Operating EMI, EEA passporting, active client base.',
  legalName: 'Valletta Payments Ltd',
  revenueCents: BigInt(2_100_000_00),
  ebitdaCents: BigInt(400_000_00),
  clientCount: 3_200,
  dataRoomUrl: 'https://dataroom.example.com/750',
  confidentialNotes: 'Founder retiring; sale is time-sensitive.',
  publishedAt: new Date('2026-08-01T00:00:00Z'),
  rejectionReason: null,
  viewCount: 41,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
}

describe('toTeaserAsset', () => {
  it('omits every confidential field from the object entirely', () => {
    const teaser = toTeaserAsset(sample)
    for (const field of CONFIDENTIAL_ASSET_FIELDS) {
      expect(Object.hasOwn(teaser, field)).toBe(false)
    }
  })

  it('keeps the teaser fields intact', () => {
    const teaser = toTeaserAsset(sample)
    expect(teaser.teaserTitle).toBe(sample.teaserTitle)
    expect(teaser.askingPriceCents).toBe(Number(sample.askingPriceCents))
  })

  it('narrows bigint money to a JSON-serialisable number', () => {
    const teaser = toTeaserAsset(sample)
    expect(typeof teaser.askingPriceCents).toBe('number')
    // bigint would throw here — this is exactly what Next.js does at the
    // server/client boundary, so the assertion is the real failure mode.
    expect(() => JSON.stringify(teaser)).not.toThrow()
  })

  it('does not leak confidential values through JSON serialisation', () => {
    const serialised = JSON.stringify(toTeaserAsset(sample))
    expect(serialised).not.toContain('Valletta Payments Ltd')
    expect(serialised).not.toContain('dataroom.example.com')
  })
})

describe('field classification', () => {
  it('classifies every scalar column on the Asset model', () => {
    // `Prisma.dmmf` does not exist on this generated client: Prisma 7's
    // `prisma-client` generator (ESM output) never calls the runtime's
    // `defineDmmfProperty` helper, so no `dmmf` getter is attached anywhere
    // reachable from the generated output. `AssetScalarFieldEnum` is the
    // generator's other, genuinely public, runtime enumeration of a model's
    // non-relation columns (it backs `distinct`/`orderBy` typings), and it is
    // built from the exact same schema metadata dmmf would have exposed —
    // relation fields (sellerProfile, accessRequests, ...) never appear in it.
    const columns = Object.values(Prisma.AssetScalarFieldEnum).sort()

    const classified = [...PUBLIC_ASSET_FIELDS, ...CONFIDENTIAL_ASSET_FIELDS].sort()
    expect(classified).toEqual(columns)
  })
})

describe('toAssetDto', () => {
  it('redacts when the caller has no full access', () => {
    const dto = toAssetDto(sample, false)
    expect(isFullAsset(dto)).toBe(false)
  })

  it('returns the full record when the caller has access', () => {
    const dto = toAssetDto(sample, true)
    expect(isFullAsset(dto)).toBe(true)
    if (isFullAsset(dto)) expect(dto.legalName).toBe('Valletta Payments Ltd')
  })
})
