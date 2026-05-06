import { createServerSupabase } from '@/lib/supabaseServer'
import { isProfane } from '@/lib/profanity'

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username') ?? ''

  if (!USERNAME_RE.test(username)) {
    return Response.json({ available: false, reason: 'invalid' })
  }

  if (isProfane(username)) {
    return Response.json({ available: false, reason: 'profane' })
  }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('players')
      .select('id')
      .ilike('username', username)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return Response.json({ available: data === null })
  } catch {
    return Response.json({ available: false, reason: 'error' }, { status: 500 })
  }
}
