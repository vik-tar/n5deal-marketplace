import { describe, expect, it } from 'vitest'
import { mapGrantState, selectGateStatus } from '@/lib/gate'

describe('mapGrantState', () => {
  it('maps a missing row to NONE', () => {
    expect(mapGrantState(null)).toBe('NONE')
  })

  it('carries an existing status over unchanged', () => {
    expect(mapGrantState('REQUESTED')).toBe('REQUESTED')
    expect(mapGrantState('APPROVED')).toBe('APPROVED')
    expect(mapGrantState('DECLINED')).toBe('DECLINED')
    expect(mapGrantState('REVOKED')).toBe('REVOKED')
  })
})

describe('selectGateStatus', () => {
  it('is OPEN whenever the DTO is full, regardless of grant or canRequest', () => {
    expect(selectGateStatus({ isFullAsset: true, grant: 'NONE', canRequest: false })).toBe('OPEN')
    expect(selectGateStatus({ isFullAsset: true, grant: 'DECLINED', canRequest: false })).toBe(
      'OPEN',
    )
  })

  it('is PENDING when the grant is REQUESTED, even if canRequest were somehow true', () => {
    expect(selectGateStatus({ isFullAsset: false, grant: 'REQUESTED', canRequest: false })).toBe(
      'PENDING',
    )
    expect(selectGateStatus({ isFullAsset: false, grant: 'REQUESTED', canRequest: true })).toBe(
      'PENDING',
    )
  })

  it('is REQUESTABLE when the caller says the viewer can request access', () => {
    expect(selectGateStatus({ isFullAsset: false, grant: 'NONE', canRequest: true })).toBe(
      'REQUESTABLE',
    )
  })

  it('is CLOSED for an anonymous visitor (grant NONE, canRequest false)', () => {
    expect(selectGateStatus({ isFullAsset: false, grant: 'NONE', canRequest: false })).toBe(
      'CLOSED',
    )
  })

  it('is CLOSED for a declined or revoked grant', () => {
    expect(selectGateStatus({ isFullAsset: false, grant: 'DECLINED', canRequest: false })).toBe(
      'CLOSED',
    )
    expect(selectGateStatus({ isFullAsset: false, grant: 'REVOKED', canRequest: false })).toBe(
      'CLOSED',
    )
  })
})
