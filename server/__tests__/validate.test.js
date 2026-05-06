import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePunch, parseHandshakeAuth } from '../lib/validate.js'

describe('parsePunch', () => {
  const VALID_ROOM = '550e8400-e29b-41d4-a716-446655440000'

  it('accepts valid jab', () => {
    const r = parsePunch({ room: VALID_ROOM, punch: 'jab' })
    assert.ok(r.success)
  })

  it('accepts all valid punch types', () => {
    for (const p of ['jab', 'cross', 'hook', 'uppercut', 'block']) {
      const r = parsePunch({ room: VALID_ROOM, punch: p })
      assert.ok(r.success, `expected ${p} to be valid`)
    }
  })

  it('rejects an unknown punch type', () => {
    const r = parsePunch({ room: VALID_ROOM, punch: 'flying-kick' })
    assert.ok(!r.success)
  })

  it('rejects missing room', () => {
    const r = parsePunch({ punch: 'jab' })
    assert.ok(!r.success)
  })

  it('rejects non-uuid room', () => {
    const r = parsePunch({ room: 'not-a-uuid', punch: 'jab' })
    assert.ok(!r.success)
  })

  it('rejects empty punch', () => {
    const r = parsePunch({ room: VALID_ROOM, punch: '' })
    assert.ok(!r.success)
  })

  it('rejects null payload', () => {
    const r = parsePunch(null)
    assert.ok(!r.success)
  })
})

describe('parseHandshakeAuth', () => {
  it('accepts valid guestId and token', () => {
    const r = parseHandshakeAuth({ guestId: '550e8400-e29b-41d4-a716-446655440000', token: 'abc:123' })
    assert.ok(r.success)
  })

  it('rejects missing guestId', () => {
    const r = parseHandshakeAuth({ token: 'abc:123' })
    assert.ok(!r.success)
  })

  it('rejects non-uuid guestId', () => {
    const r = parseHandshakeAuth({ guestId: 'not-a-uuid', token: 'abc:123' })
    assert.ok(!r.success)
  })

  it('rejects missing token', () => {
    const r = parseHandshakeAuth({ guestId: '550e8400-e29b-41d4-a716-446655440000' })
    assert.ok(!r.success)
  })

  it('accepts null auth (unauthenticated connection)', () => {
    const r = parseHandshakeAuth(null)
    assert.ok(r.success)
    assert.equal(r.data, null)
  })
})
