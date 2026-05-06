import { createServerSupabase } from '@/lib/supabaseServer'

export const revalidate = 30

export async function GET() {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('public_players')
      .select('id, username, rating, games_played, wins, losses, draws')
      .order('rating', { ascending: false })
      .limit(100)

    if (error) throw error

    return Response.json({
      players: data,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
