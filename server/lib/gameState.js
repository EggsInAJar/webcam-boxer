import { DAMAGE, BLOCK_REDUCTION, ROUND_HP, ROUND_DURATION, MAX_ROUNDS } from './constants.js'

export function createRoomState(leftGuestId, rightGuestId) {
  return {
    sides: {
      left:  createSide(leftGuestId),
      right: createSide(rightGuestId),
    },
    round: 1,
    timer: ROUND_DURATION,
    phase: 'fighting',
    roundWinner: null,
    matchWinner: undefined,
  }
}

function createSide(guestId) {
  return { guestId, hp: ROUND_HP, blocking: false, roundsWon: 0 }
}

export function applyPunchToState(state, fromSide, punchType) {
  if (punchType === 'block') {
    return setBlocking(state, fromSide, true)
  }

  const toSide = fromSide === 'left' ? 'right' : 'left'
  const defender = state.sides[toSide]
  const rawDmg = DAMAGE[punchType] ?? 0
  if (rawDmg === 0) return state

  const dmg = defender.blocking ? Math.round(rawDmg * BLOCK_REDUCTION) : rawDmg
  const newHp = Math.max(0, defender.hp - dmg)

  return {
    ...state,
    sides: {
      ...state.sides,
      [toSide]: { ...defender, hp: newHp },
    },
  }
}

export function setBlocking(state, side, value) {
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: { ...state.sides[side], blocking: value },
    },
  }
}

export function clearBlocking(state, side) {
  return setBlocking(state, side, false)
}

export function resolveRound(state) {
  const { left, right } = state.sides

  let leftWins = left.roundsWon
  let rightWins = right.roundsWon

  let roundWinner = null
  if (left.hp > right.hp) { leftWins++; roundWinner = 'left' }
  else if (right.hp > left.hp) { rightWins++; roundWinner = 'right' }

  const isMatchOver =
    leftWins > MAX_ROUNDS / 2 ||
    rightWins > MAX_ROUNDS / 2 ||
    state.round >= MAX_ROUNDS

  let matchWinner = undefined
  if (isMatchOver) {
    matchWinner = leftWins > rightWins ? 'left' : rightWins > leftWins ? 'right' : null
  }

  return {
    ...state,
    sides: {
      left:  { ...left,  roundsWon: leftWins,  hp: ROUND_HP, blocking: false },
      right: { ...right, roundsWon: rightWins, hp: ROUND_HP, blocking: false },
    },
    round: state.round + (isMatchOver ? 0 : 1),
    timer: ROUND_DURATION,
    phase: isMatchOver ? 'gameOver' : 'roundEnd',
    roundWinner,
    matchWinner,
  }
}
