import type { GameState, PunchType, FighterState } from './types'

export const DAMAGE: Record<Exclude<PunchType, 'block'>, number> = {
  jab: 5,
  cross: 12,
  hook: 10,
  uppercut: 15,
}

const BLOCK_REDUCTION = 0.5
const ROUND_HP = 100
const ROUND_DURATION = 60 // seconds
const MAX_ROUNDS = 3

export function createGame(): GameState {
  return {
    player: createFighter(),
    opponent: createFighter(),
    round: 1,
    timer: ROUND_DURATION,
    phase: 'calibrating',
    lastHitText: null,
    lastHitTime: 0,
    lastHitDamage: 0,
    hitTarget: null,
  }
}

function createFighter(): FighterState {
  return {
    hp: ROUND_HP,
    blocking: false,
    lastPunch: null,
    lastPunchTime: 0,
    roundsWon: 0,
  }
}

export function applyPunch(
  state: GameState,
  punch: PunchType,
  target: 'player' | 'opponent'
): GameState {
  if (state.phase !== 'fighting') return state
  if (punch === 'block') {
    const who = target === 'player' ? 'player' : 'opponent'
    return {
      ...state,
      [who]: { ...state[who], blocking: true },
    }
  }

  const defender = state[target]
  const rawDmg = DAMAGE[punch as keyof typeof DAMAGE]
  const dmg = defender.blocking ? Math.round(rawDmg * BLOCK_REDUCTION) : rawDmg
  const newHp = Math.max(0, defender.hp - dmg)
  const label = punch.toUpperCase() + '!'

  const attackerKey = target === 'opponent' ? 'player' : 'opponent'

  const newState: GameState = {
    ...state,
    [target]: { ...defender, hp: newHp },
    [attackerKey]: { ...state[attackerKey], lastPunch: punch, lastPunchTime: performance.now() },
    lastHitText: label,
    lastHitTime: performance.now(),
    lastHitDamage: dmg,
    hitTarget: target,
  }

  if (newHp === 0) {
    return resolveRoundEnd(newState)
  }

  return newState
}

export function clearBlock(state: GameState, who: 'player' | 'opponent'): GameState {
  return { ...state, [who]: { ...state[who], blocking: false } }
}

export function tick(state: GameState, dtMs: number): GameState {
  if (state.phase !== 'fighting') return state

  const newTimer = Math.max(0, state.timer - dtMs / 1000)

  if (newTimer === 0) {
    return resolveRoundEnd({ ...state, timer: 0 })
  }

  return { ...state, timer: newTimer }
}

export function startCountdown(state: GameState): GameState {
  return { ...state, phase: 'countdown' }
}

export function startFighting(state: GameState): GameState {
  return { ...state, phase: 'fighting' }
}

function resolveRoundEnd(state: GameState): GameState {
  const { player, opponent } = state

  let pWins = player.roundsWon
  let oWins = opponent.roundsWon

  if (player.hp > opponent.hp) pWins++
  else if (opponent.hp > player.hp) oWins++
  // exact tie: no round awarded

  const roundsDone = state.round

  if (pWins > MAX_ROUNDS / 2 || oWins > MAX_ROUNDS / 2 || roundsDone >= MAX_ROUNDS) {
    return {
      ...state,
      player: { ...player, roundsWon: pWins },
      opponent: { ...opponent, roundsWon: oWins },
      phase: 'gameOver',
    }
  }

  return {
    ...state,
    player: { ...createFighter(), roundsWon: pWins },
    opponent: { ...createFighter(), roundsWon: oWins },
    round: state.round + 1,
    timer: ROUND_DURATION,
    phase: 'roundEnd',
    lastHitText: null,
    hitTarget: null,
  }
}

export function getWinner(state: GameState): 'player' | 'opponent' | 'draw' {
  if (state.player.roundsWon > state.opponent.roundsWon) return 'player'
  if (state.opponent.roundsWon > state.player.roundsWon) return 'opponent'
  return 'draw'
}
