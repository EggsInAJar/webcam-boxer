import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearIdentityCache } from '../identity'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

const MOCK_IDENTITY = {
  guestId: 'abc-123',
  token: 'hmac:1234567890',
  rating: 1200,
  username: null,
}

describe('getIdentity', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearIdentityCache()
    mockFetch.mockReset()
  })

  it('calls the identity endpoint when localStorage is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })
    const { getIdentity } = await import('../identity')
    const identity = await getIdentity()

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/identity')
    expect(identity.guestId).toBe('abc-123')
    expect(identity.rating).toBe(1200)
  })

  it('sends stored guestId in the request body', async () => {
    localStorageMock.setItem('wb_identity', JSON.stringify(MOCK_IDENTITY))
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })
    const { getIdentity } = await import('../identity')
    await getIdentity()

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.guestId).toBe('abc-123')
  })

  it('returns cached identity without extra fetch calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })
    const { getIdentity } = await import('../identity')
    await getIdentity()
    await getIdentity()

    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('throws when the server returns a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const { getIdentity } = await import('../identity')
    await expect(getIdentity()).rejects.toThrow('500')
  })

  it('persists the identity to localStorage after a successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })
    const { getIdentity } = await import('../identity')
    await getIdentity()

    const stored = JSON.parse(localStorageMock.getItem('wb_identity') ?? '{}')
    expect(stored.guestId).toBe('abc-123')
  })
})

describe('refreshRating', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearIdentityCache()
    mockFetch.mockReset()
  })

  it('updates the cached rating without re-fetching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })
    const { getIdentity, refreshRating } = await import('../identity')
    await getIdentity()
    refreshRating(1216)

    const identity = await getIdentity()
    expect(identity.rating).toBe(1216)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('is a no-op when there is no cached identity', async () => {
    const { refreshRating } = await import('../identity')
    // Should not throw even with no cached identity
    expect(() => refreshRating(1300)).not.toThrow()
  })
})

describe('getProfile', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearIdentityCache()
    mockFetch.mockReset()
  })

  it('fetches identity first then hits /api/profile with guest headers', async () => {
    const profileData = { ...MOCK_IDENTITY, rating: 1250, username: 'TestUser' }
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({ ok: true, json: async () => profileData })

    const { getProfile } = await import('../identity')
    const result = await getProfile()

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const profileCall = mockFetch.mock.calls[1]
    expect(profileCall[0]).toContain('/api/profile')
    expect(profileCall[1].headers['x-guest-id']).toBe(MOCK_IDENTITY.guestId)
    expect(profileCall[1].headers['x-guest-token']).toBe(MOCK_IDENTITY.token)
    expect(result.username).toBe('TestUser')
    expect(result.rating).toBe(1250)
  })

  it('throws when /api/profile returns non-ok', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({ ok: false, status: 401 })

    const { getProfile } = await import('../identity')
    await expect(getProfile()).rejects.toThrow('401')
  })
})

describe('setUsername', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearIdentityCache()
    mockFetch.mockReset()
  })

  it('PATCHes /api/profile with username and guest auth headers', async () => {
    const updated = { ...MOCK_IDENTITY, username: 'NewName' }
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({ ok: true, json: async () => updated })

    const { setUsername } = await import('../identity')
    const result = await setUsername('NewName')

    expect(result.username).toBe('NewName')
    const patchCall = mockFetch.mock.calls[1]
    expect(patchCall[0]).toContain('/api/profile')
    expect(patchCall[1].method).toBe('PATCH')
    expect(JSON.parse(patchCall[1].body).username).toBe('NewName')
    expect(patchCall[1].headers['x-guest-id']).toBe(MOCK_IDENTITY.guestId)
  })

  it('throws the server error message on non-ok response', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Username already taken' }),
      })

    const { setUsername } = await import('../identity')
    await expect(setUsername('TakenName')).rejects.toThrow('Username already taken')
  })

  it('falls back to generic error when response body is not JSON', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new SyntaxError('not json') },
      })

    const { setUsername } = await import('../identity')
    await expect(setUsername('Foo')).rejects.toThrow()
  })

  it('persists updated identity to localStorage', async () => {
    const updated = { ...MOCK_IDENTITY, username: 'Saved' }
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_IDENTITY })
      .mockResolvedValueOnce({ ok: true, json: async () => updated })

    const { setUsername } = await import('../identity')
    await setUsername('Saved')

    const stored = JSON.parse(localStorageMock.getItem('wb_identity') ?? '{}')
    expect(stored.username).toBe('Saved')
  })
})

describe('loadStored — corrupt localStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
    clearIdentityCache()
    mockFetch.mockReset()
  })

  it('handles corrupt localStorage JSON gracefully and still fetches identity', async () => {
    localStorageMock.setItem('wb_identity', 'not-valid-json{{{')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_IDENTITY,
    })

    const { getIdentity } = await import('../identity')
    const identity = await getIdentity()

    expect(identity.guestId).toBe('abc-123')
    // No stored guestId was read, so request body should have empty object
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.guestId).toBeUndefined()
  })
})
