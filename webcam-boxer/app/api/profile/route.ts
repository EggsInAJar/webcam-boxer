import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServerSupabase } from '@/lib/supabaseServer'
import { isProfane } from '@/lib/profanity'

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function verifyToken(guestId: string, token: string): boolean {
  const secret = process.env.IDENTITY_SIGNING_SECRET
  if (!secret) return false

  const colonIdx = token.lastIndexOf(':')
  if (colonIdx === -1) return false

  const hmac = token.slice(0, colonIdx)
  const issuedAt = parseInt(token.slice(colonIdx + 1), 10)

  if (isNaN(issuedAt) || Date.now() - issuedAt > TOKEN_TTL_MS) return false

  const expected = createHmac('sha256', secret)
    .update(`${guestId}:${issuedAt}`)
    .digest('hex')

  try {
    const a = Buffer.from(hmac.padEnd(64, '0'), 'hex')
    const b = Buffer.from(expected, 'hex')
    if (hmac.length !== expected.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const guestId = request.headers.get('x-guest-id')
  const token = request.headers.get('x-guest-token')

  if (!guestId || !token) {
    return Response.json({ error: 'Missing credentials' }, { status: 401 })
  }
  if (!UUID_RE.test(guestId)) {
    return Response.json({ error: 'Invalid guest id' }, { status: 400 })
  }
  if (!verifyToken(guestId, token)) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('players')
      .select('id, username, rating, games_played, wins, losses, draws')
      .eq('id', guestId)
      .single()

    if (error || !data) return Response.json({ error: 'Player not found' }, { status: 404 })
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const guestId = request.headers.get('x-guest-id')
  const token = request.headers.get('x-guest-token')

  if (!guestId || !token) {
    return Response.json({ error: 'Missing credentials' }, { status: 401 })
  }
  if (!UUID_RE.test(guestId)) {
    return Response.json({ error: 'Invalid guest id' }, { status: 400 })
  }
  if (!verifyToken(guestId, token)) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.username !== 'string') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { username } = body as { username: string }

  if (!USERNAME_RE.test(username)) {
    return Response.json(
      { error: 'Username must be 3-16 characters: letters, numbers, underscores only' },
      { status: 422 }
    )
  }

  if (isProfane(username)) {
    return Response.json({ error: 'Username contains disallowed words' }, { status: 422 })
  }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('players')
      .update({ username })
      .eq('id', guestId)
      .select('id, username, rating, games_played, wins, losses, draws')
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Username already taken' }, { status: 409 })
      }
      throw error
    }

    return Response.json(data)
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
