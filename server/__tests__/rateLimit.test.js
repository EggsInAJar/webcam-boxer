import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { RateLimiter } from '../lib/rateLimit.js'

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const rl = new RateLimiter(5, 1000)
    for (let i = 0; i < 5; i++) {
      assert.equal(rl.check('key').allowed, true)
    }
  })

  it('blocks the request that exceeds the limit', () => {
    const rl = new RateLimiter(3, 1000)
    rl.check('k'); rl.check('k'); rl.check('k')
    assert.equal(rl.check('k').allowed, false)
  })

  it('tracks different keys independently', () => {
    const rl = new RateLimiter(1, 1000)
    assert.equal(rl.check('a').allowed, true)
    assert.equal(rl.check('b').allowed, true)
    assert.equal(rl.check('a').allowed, false)
  })

  it('returns correct remaining count', () => {
    const rl = new RateLimiter(3, 1000)
    assert.equal(rl.check('k').remaining, 2)
    assert.equal(rl.check('k').remaining, 1)
    assert.equal(rl.check('k').remaining, 0)
  })

  it('returns remaining 0 and allowed false when over limit', () => {
    const rl = new RateLimiter(2, 1000)
    rl.check('k'); rl.check('k')
    const result = rl.check('k')
    assert.equal(result.allowed, false)
    assert.equal(result.remaining, 0)
  })

  it('resets after the window expires', async () => {
    const rl = new RateLimiter(1, 60) // 60ms window
    rl.check('k')
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(rl.check('k').allowed, true)
  })

  it('provides a resetAt timestamp in the future', () => {
    const before = Date.now()
    const rl = new RateLimiter(2, 1000)
    const { resetAt } = rl.check('k')
    assert.ok(resetAt > before)
  })
})
