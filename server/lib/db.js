import { getSupabase } from './supabase.js'
import { applyElo } from './elo.js'
import { logger } from './logger.js'

/**
 * Pure: compute ELO deltas and new ratings for a match result.
 * playerA = left side, playerB = right side.
 * winnerSide: 'left' | 'right' | null (draw)
 */
export function computeEloUpdate(ratingA, ratingB, winnerSide) {
  const scoreA = winnerSide === 'left' ? 1 : winnerSide === 'right' ? 0 : 0.5
  const scoreB = 1 - scoreA
  const { newA, newB, deltaA, deltaB } = applyElo(ratingA, ratingB, scoreA, scoreB)
  return { newRatingA: newA, newRatingB: newB, deltaA, deltaB }
}

/**
 * Record a completed match atomically via the record_match RPC.
 * Returns { matchId, deltaA, deltaB, newRatingA, newRatingB } or null on failure.
 */
export async function recordMatch({ playerAId, playerBId, winnerSide, sides, endedReason }) {
  const supabase = getSupabase()

  // Fetch current ratings for ELO computation
  const { data: players, error: fetchErr } = await supabase
    .from('players')
    .select('id, rating')
    .in('id', [playerAId, playerBId])

  if (fetchErr || !players || players.length < 2) {
    logger.warn({ playerAId, playerBId, fetchErr }, 'recordMatch: could not fetch player ratings')
    return null
  }

  const byId = Object.fromEntries(players.map((p) => [p.id, p.rating]))
  const ratingA = byId[playerAId] ?? 1200
  const ratingB = byId[playerBId] ?? 1200

  const { newRatingA, newRatingB, deltaA, deltaB } = computeEloUpdate(ratingA, ratingB, winnerSide)

  const winnerId =
    winnerSide === 'left'  ? sides.left.guestId :
    winnerSide === 'right' ? sides.right.guestId :
    null

  const { data, error: rpcErr } = await supabase.rpc('record_match', {
    p_player_a:        playerAId,
    p_player_b:        playerBId,
    p_winner:          winnerId,
    p_rounds_a:        sides.left.roundsWon,
    p_rounds_b:        sides.right.roundsWon,
    p_rating_a_before: ratingA,
    p_rating_b_before: ratingB,
    p_rating_a_after:  newRatingA,
    p_rating_b_after:  newRatingB,
    p_ended_reason:    endedReason,
  })

  if (rpcErr) {
    logger.error({ rpcErr }, 'recordMatch RPC failed')
    return null
  }

  const matchId = data?.match_id ?? null
  logger.info({ matchId, winnerId, endedReason, deltaA, deltaB }, 'match recorded')
  return { matchId, deltaA, deltaB, newRatingA, newRatingB }
}
