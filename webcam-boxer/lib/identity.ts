export type Identity = {
  guestId: string
  token: string
  rating: number
  username: string | null
}

const STORAGE_KEY = 'wb_identity'
let _cache: Identity | null = null

export async function getIdentity(): Promise<Identity> {
  if (_cache) return _cache

  const stored = loadStored()
  const body = stored?.guestId ? { guestId: stored.guestId } : {}

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'
  const res = await fetch(`${socketUrl}/v1/identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Identity fetch failed: ${res.status}`)

  const data: Identity = await res.json()
  _cache = data
  saveStored(data)
  return data
}

export async function getProfile(): Promise<Identity> {
  const current = await getIdentity()
  const res = await fetch('/api/profile', {
    headers: {
      'x-guest-id': current.guestId,
      'x-guest-token': current.token,
    },
  })
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
  const data: Identity = await res.json()
  _cache = { ...current, ...data }
  saveStored(_cache)
  return _cache
}

export async function setUsername(username: string): Promise<Identity> {
  const current = await getIdentity()

  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': current.guestId,
      'x-guest-token': current.token,
    },
    body: JSON.stringify({ username }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `Failed to set username: ${res.status}`)
  }

  const updated: Identity = await res.json()
  _cache = { ...current, ...updated }
  saveStored(_cache)
  return _cache
}

export function refreshRating(newRating: number): void {
  if (_cache) {
    _cache = { ..._cache, rating: newRating }
    saveStored(_cache)
  }
}

export function clearIdentityCache(): void {
  _cache = null
}

function loadStored(): Partial<Identity> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Identity>) : null
  } catch {
    return null
  }
}

function saveStored(identity: Identity): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // localStorage unavailable or full — non-fatal
  }
}
