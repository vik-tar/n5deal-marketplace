import { describe, expect, it } from 'vitest'
import { buildThreadKey } from '@/lib/thread-key'

describe('buildThreadKey', () => {
  it('is stable for the same triple', () => {
    const input = { assetId: 'a-1', buyerProfileId: 'b-1', sellerProfileId: 's-1' }
    expect(buildThreadKey(input)).toBe(buildThreadKey(input))
  })

  it('distinguishes conversations about different assets', () => {
    expect(buildThreadKey({ assetId: 'a-1', buyerProfileId: 'b-1', sellerProfileId: 's-1' })).not.toBe(
      buildThreadKey({ assetId: 'a-2', buyerProfileId: 'b-1', sellerProfileId: 's-1' }),
    )
  })

  it('collapses every asset-less conversation between one pair into one key', () => {
    expect(buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' })).toBe(
      buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' }),
    )
  })

  it('does not collide an asset-less thread with one about an asset named "none"', () => {
    expect(buildThreadKey({ assetId: null, buyerProfileId: 'b-1', sellerProfileId: 's-1' })).not.toBe(
      buildThreadKey({ assetId: 'none', buyerProfileId: 'b-1', sellerProfileId: 's-1' }),
    )
  })
})
