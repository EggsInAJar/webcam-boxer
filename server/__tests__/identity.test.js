import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signToken, mintToken, verifyToken } from '../lib/identity.js'

const SECRET = 'test-secret-do-not-use-in-prod'
const GUEST_ID = 'test-guest-uuid-1234'

describe('signToken / verifyToken', () => {
  it('verifies a freshly minted token', () => {
    const token = mintToken(GUEST_ID, SECRET)
    assert.ok(verifyToken(GUEST_ID, token, SECRET), 'fresh token should verify')
  })

  it('rejects a token with a tampered guestId', () => {
    const token = mintToken(GUEST_ID, SECRET)
    assert.equal(verifyToken('different-id', token, SECRET), false)
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintToken(GUEST_ID, SECRET)
    assert.equal(verifyToken(GUEST_ID, token, 'wrong-secret'), false)
  })

  it('rejects a token with a tampered HMAC', () => {
    const token = mintToken(GUEST_ID, SECRET)
    const [, issuedAt] = token.split(':').reverse()
    const fakeToken = `deadbeefcafe:${issuedAt}`
    assert.equal(verifyToken(GUEST_ID, fakeToken, SECRET), false)
  })

  it('rejects a token with no colon separator', () => {
    assert.equal(verifyToken(GUEST_ID, 'nocolon', SECRET), false)
  })

  it('rejects an expired token (> 7 days old)', () => {
    const issuedAt = Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
    const hmac = signToken(GUEST_ID, issuedAt, SECRET)
    const expiredToken = `${hmac}:${issuedAt}`
    assert.equal(verifyToken(GUEST_ID, expiredToken, SECRET), false)
  })

  it('rejects a token with non-numeric issuedAt', () => {
    assert.equal(verifyToken(GUEST_ID, 'somehmac:notanumber', SECRET), false)
  })

  it('tokens for different guestIds produce different HMACs', () => {
    const t1 = mintToken('guest-a', SECRET)
    const t2 = mintToken('guest-b', SECRET)
    const hmac1 = t1.split(':').slice(0, -1).join(':')
    const hmac2 = t2.split(':').slice(0, -1).join(':')
    assert.notEqual(hmac1, hmac2)
  })
})
