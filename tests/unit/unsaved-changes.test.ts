import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearUnsavedChanges,
  hasUnsavedChanges,
  setUnsavedChanges,
} from '@/lib/unsaved-changes'

/**
 * The registry outlives every component that writes to it, which is the whole
 * point and also the whole risk: an entry left behind blocks every later
 * navigation in the app with nothing on screen to explain why. These assert the
 * two properties that make that impossible.
 */
describe('unsaved-changes registry', () => {
  beforeEach(clearUnsavedChanges)

  it('starts empty', () => {
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('reports work once it is registered, and stops once it is cleared', () => {
    setUnsavedChanges('profile', true)
    expect(hasUnsavedChanges()).toBe(true)
    setUnsavedChanges('profile', false)
    expect(hasUnsavedChanges()).toBe(false)
  })

  /**
   * React invokes effects twice on mount in development. A counter would reach
   * 2 and never return to 0 on a single unmount, leaving the app permanently
   * convinced there is unsaved work — this is why the registry is keyed.
   */
  it('survives the same key registered twice and cleared once', () => {
    setUnsavedChanges('profile', true)
    setUnsavedChanges('profile', true)
    setUnsavedChanges('profile', false)
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('keeps reporting while any other holder is still dirty', () => {
    setUnsavedChanges('profile', true)
    setUnsavedChanges('listing', true)
    setUnsavedChanges('profile', false)
    expect(hasUnsavedChanges()).toBe(true)
    setUnsavedChanges('listing', false)
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('ignores clearing a key that was never registered', () => {
    setUnsavedChanges('never-seen', false)
    expect(hasUnsavedChanges()).toBe(false)
  })
})
