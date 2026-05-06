import { test, expect } from '@playwright/test'

test.describe('GET /api/username-check', () => {
  test('returns available:false for too-short username', async ({ request }) => {
    const res = await request.get('/api/username-check?username=ab')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  test('returns available:false for username with spaces', async ({ request }) => {
    const res = await request.get('/api/username-check?username=hello+world')
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  test('returns available:false for profane username', async ({ request }) => {
    const res = await request.get('/api/username-check?username=shitboxer')
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('profane')
  })

  test('returns available:false for too-long username (17 chars)', async ({ request }) => {
    const res = await request.get('/api/username-check?username=ABCDEFGHIJKLMNOPQ')
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  test('returns available:false for username with special chars', async ({ request }) => {
    const res = await request.get('/api/username-check?username=user@name')
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  test('valid format reaches DB check (returns available true or false)', async ({ request }) => {
    // This test will hit the DB. If DB is unavailable it returns 500 with reason:error.
    // Either way, the response should be valid JSON with an `available` boolean.
    const res = await request.get('/api/username-check?username=ValidUser99')
    const body = await res.json()
    expect(typeof body.available).toBe('boolean')
  })
})

test.describe('GET /api/leaderboard (Next.js route via fetch)', () => {
  test('responds with JSON', async ({ request }) => {
    const res = await request.get('/api/leaderboard')
    // 200 with { players, updatedAt } when DB available; 500 with { error } otherwise
    const body = await res.json()
    if (res.ok()) {
      expect(Array.isArray(body.players)).toBe(true)
      expect(typeof body.updatedAt).toBe('string')
    } else {
      expect(typeof body.error).toBe('string')
    }
  })
})

test.describe('PATCH /api/profile — validation (no auth needed to hit guard)', () => {
  test('returns 401 for missing credentials', async ({ request }) => {
    const res = await request.patch('/api/profile', {
      data: { username: 'TestUser' },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 400 for invalid guest id format', async ({ request }) => {
    const res = await request.patch('/api/profile', {
      headers: { 'x-guest-id': 'not-a-uuid', 'x-guest-token': 'fake' },
      data: { username: 'TestUser' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET /api/profile returns 401 for missing credentials', async ({ request }) => {
    const res = await request.get('/api/profile')
    expect(res.status()).toBe(401)
  })

  test('GET /api/profile returns 400 for invalid guest id format', async ({ request }) => {
    const res = await request.get('/api/profile', {
      headers: { 'x-guest-id': 'not-a-uuid', 'x-guest-token': 'fake' },
    })
    expect(res.status()).toBe(400)
  })
})
