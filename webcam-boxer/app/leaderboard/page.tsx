import { createServerSupabase } from '@/lib/supabaseServer'
import type { Player } from '@/lib/api'

export const revalidate = 30

export default async function LeaderboardPage() {
  let players: Player[] = []
  let fetchError = false

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('public_players')
      .select('id, username, rating, games_played, wins, losses, draws')
      .order('rating', { ascending: false })
      .limit(100)

    if (error) throw error
    players = data ?? []
  } catch {
    fetchError = true
  }

  return (
    <main className="min-h-screen bg-[#080808] flex flex-col items-center px-4 py-12 gap-8">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <a
          href="/"
          className="font-pixel text-[8px] text-white/30 hover:text-white/60"
          aria-label="Back to main menu"
        >
          ← BACK
        </a>
        <h1 className="font-pixel text-sm" style={{ color: '#FFD700' }}>
          LEADERBOARD
        </h1>
      </div>

      {fetchError ? (
        <p className="font-pixel text-[10px] text-[#FF1744]">FAILED TO LOAD LEADERBOARD</p>
      ) : (
        <div className="w-full max-w-2xl border border-white/10">
          <div className="grid grid-cols-[2rem_1fr_6rem_3rem_3rem] gap-2 px-4 py-2 border-b border-white/10 font-pixel text-[7px] text-white/30">
            <span className="text-right">#</span>
            <span>PLAYER</span>
            <span className="text-right">RATING</span>
            <span className="text-right">W</span>
            <span className="text-right">L</span>
          </div>

          {players.length === 0 ? (
            <div className="px-4 py-10 text-center font-pixel text-[8px] text-white/30">
              NO PLAYERS YET. BE THE FIRST!
            </div>
          ) : (
            players.map((p, i) => {
              const name = p.username ?? `Guest-${p.id.slice(0, 4).toUpperCase()}`
              const isTop3 = i < 3
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-[2rem_1fr_6rem_3rem_3rem] gap-2 px-4 py-2 border-b border-white/5 font-pixel text-[8px]"
                  style={{ color: isTop3 ? '#FFD700' : 'rgba(255,255,255,0.7)' }}
                >
                  <span
                    className="text-right"
                    style={{ color: isTop3 ? '#FFD700' : 'rgba(255,255,255,0.25)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{name}</span>
                  <span className="text-right">★ {p.rating}</span>
                  <span className="text-right" style={{ color: '#00E676' }}>
                    {p.wins}
                  </span>
                  <span className="text-right" style={{ color: '#FF1744' }}>
                    {p.losses}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}
    </main>
  )
}
