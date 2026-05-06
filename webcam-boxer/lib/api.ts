export type Player = {
  id: string
  username: string | null
  rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
}

export type LeaderboardResponse = {
  players: Player[]
  updatedAt: string
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch('/api/leaderboard')
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json() as Promise<LeaderboardResponse>
}

export async function fetchProfile(guestId: string): Promise<Player> {
  const res = await fetch('/api/profile', {
    headers: { 'x-guest-id': guestId },
  })
  if (!res.ok) throw new Error('Failed to fetch profile')
  return res.json() as Promise<Player>
}
