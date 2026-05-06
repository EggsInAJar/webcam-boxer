const RATING_FLOOR = 100

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function applyElo(ratingA, ratingB, scoreA, scoreB, K = 32) {
  const eA = expectedScore(ratingA, ratingB)
  const eB = expectedScore(ratingB, ratingA)

  const deltaA = Math.round(K * (scoreA - eA))
  const deltaB = Math.round(K * (scoreB - eB))

  const newA = Math.max(RATING_FLOOR, ratingA + deltaA)
  const newB = Math.max(RATING_FLOOR, ratingB + deltaB)

  return { newA, newB, deltaA, deltaB }
}
