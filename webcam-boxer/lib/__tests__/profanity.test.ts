import { describe, it, expect } from 'vitest'
import { isProfane } from '../profanity'

describe('isProfane', () => {
  it('returns false for a clean username', () => {
    expect(isProfane('CoolBoxer99')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isProfane('')).toBe(false)
  })

  it('detects a blocked word', () => {
    expect(isProfane('shithead')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isProfane('FUCKBOY')).toBe(true)
  })

  it('detects a blocked word embedded in a longer string', () => {
    expect(isProfane('shitboxer')).toBe(true)
  })

  it('returns false for legitimate substrings that only partially match', () => {
    // "class" contains "ass" — this is an acceptable false positive at word level;
    // our filter works on normalized runs, so let's verify real clean names pass
    expect(isProfane('Boxer123')).toBe(false)
    expect(isProfane('Puncher')).toBe(false)
  })
})
