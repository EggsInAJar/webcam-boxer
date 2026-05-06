import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function signToken(guestId, issuedAt, secret) {
  return createHmac('sha256', secret)
    .update(`${guestId}:${issuedAt}`)
    .digest('hex')
}

export function mintToken(guestId, secret) {
  const issuedAt = Date.now()
  const hmac = signToken(guestId, issuedAt, secret)
  return `${hmac}:${issuedAt}`
}

export function verifyToken(guestId, token, secret) {
  const colonIdx = token.lastIndexOf(':')
  if (colonIdx === -1) return false

  const hmac = token.slice(0, colonIdx)
  const issuedAt = parseInt(token.slice(colonIdx + 1), 10)

  if (isNaN(issuedAt)) return false
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return false

  const expected = signToken(guestId, issuedAt, secret)

  try {
    const a = Buffer.from(hmac.padEnd(64, '0'), 'hex')
    const b = Buffer.from(expected, 'hex')
    // Ensure equal length before timing-safe compare
    if (hmac.length !== expected.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function findOrCreatePlayer(supabase, guestId) {
  if (guestId) {
    const { data } = await supabase
      .from('players')
      .select('id, username, rating')
      .eq('id', guestId)
      .single()

    if (data) {
      await supabase
        .from('players')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', guestId)
      return data
    }
  }

  const newId = randomUUID()
  const { data, error } = await supabase
    .from('players')
    .insert({ id: newId })
    .select('id, username, rating')
    .single()

  if (error) throw error
  return data
}
