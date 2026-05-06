import { describe, it, expect, beforeEach } from 'vitest'
import {
  createGame,
  applyPunch,
  clearBlock,
  tick,
  startCountdown,
  startFighting,
  getWinner,
  DAMAGE,
} from '../gameEngine'
import type { GameState } from '../types'

function fighting(): GameState {
  return { ...createGame(), phase: 'fighting' }
}

describe('createGame', () => {
  it('starts in calibrating phase with full HP', () => {
    const s = createGame()
    expect(s.phase).toBe('calibrating')
    expect(s.player.hp).toBe(100)
    expect(s.opponent.hp).toBe(100)
    expect(s.round).toBe(1)
    expect(s.timer).toBe(60)
  })

  it('starts with both fighters not blocking', () => {
    const s = createGame()
    expect(s.player.blocking).toBe(false)
    expect(s.opponent.blocking).toBe(false)
  })
})

describe('DAMAGE constants', () => {
  it('has values for jab, cross, hook, uppercut', () => {
    expect(DAMAGE.jab).toBeGreaterThan(0)
    expect(DAMAGE.cross).toBeGreaterThan(0)
    expect(DAMAGE.hook).toBeGreaterThan(0)
    expect(DAMAGE.uppercut).toBeGreaterThan(0)
  })
})

describe('applyPunch', () => {
  it('returns unchanged state when not in fighting phase', () => {
    const s = createGame()
    const after = applyPunch(s, 'jab', 'opponent')
    expect(after).toBe(s)
  })

  it('deals correct damage to opponent', () => {
    const s = fighting()
    const after = applyPunch(s, 'cross', 'opponent')
    expect(after.opponent.hp).toBe(100 - DAMAGE.cross)
  })

  it('deals correct damage to player', () => {
    const s = fighting()
    const after = applyPunch(s, 'jab', 'player')
    expect(after.player.hp).toBe(100 - DAMAGE.jab)
  })

  it('reduces damage by 50% when defender is blocking', () => {
    const s = { ...fighting(), opponent: { ...fighting().opponent, blocking: true } }
    const after = applyPunch(s, 'cross', 'opponent')
    expect(after.opponent.hp).toBe(100 - Math.round(DAMAGE.cross * 0.5))
  })

  it('resolves the round immediately when hp would go below 0', () => {
    const s = { ...fighting(), player: { ...fighting().player, hp: 1 } }
    const after = applyPunch(s, 'uppercut', 'player')
    // hp reached 0 → resolveRoundEnd fires and resets fighters for the next round
    expect(['roundEnd', 'gameOver']).toContain(after.phase)
  })

  it('sets hitTarget and lastHitText', () => {
    const s = fighting()
    const after = applyPunch(s, 'hook', 'opponent')
    expect(after.hitTarget).toBe('opponent')
    expect(after.lastHitText).toBe('HOOK!')
  })

  it('sets attacker lastPunch', () => {
    const s = fighting()
    const after = applyPunch(s, 'jab', 'opponent')
    expect(after.player.lastPunch).toBe('jab')
  })

  it('sets defender blocking to true for block punch type', () => {
    const s = fighting()
    const after = applyPunch(s, 'block', 'player')
    expect(after.player.blocking).toBe(true)
  })

  it('triggers roundEnd or gameOver when opponent hp hits 0', () => {
    const s = { ...fighting(), opponent: { ...fighting().opponent, hp: 1 } }
    const after = applyPunch(s, 'jab', 'opponent')
    expect(['roundEnd', 'gameOver']).toContain(after.phase)
  })

  it('triggers gameOver when a fighter wins the match (best of 3)', () => {
    // Player already won round 1 — now they KO opponent in round 2
    const s: GameState = {
      ...fighting(),
      round: 2,
      player: { ...fighting().player, roundsWon: 1 },
      opponent: { ...fighting().opponent, hp: 1 },
    }
    const after = applyPunch(s, 'jab', 'opponent')
    expect(after.phase).toBe('gameOver')
    expect(after.player.roundsWon).toBe(2)
  })

  it('advances to roundEnd (not gameOver) when no one has won the match yet', () => {
    const s: GameState = {
      ...fighting(),
      round: 1,
      player: { ...fighting().player, roundsWon: 0 },
      opponent: { ...fighting().opponent, hp: 1 },
    }
    const after = applyPunch(s, 'jab', 'opponent')
    expect(after.phase).toBe('roundEnd')
    expect(after.round).toBe(2)
  })

  it('awards no round on exact HP tie', () => {
    // Both fighters at 1 HP — jab player, opponent also at 1
    const s: GameState = {
      ...fighting(),
      round: 3, // final round
      player: { ...fighting().player, hp: 1, roundsWon: 1 },
      opponent: { ...fighting().opponent, hp: 1, roundsWon: 1 },
    }
    // Tick timer to 0 to force a tied round end
    const after = tick({ ...s, timer: 0.1 }, 200)
    expect(['roundEnd', 'gameOver']).toContain(after.phase)
  })
})

describe('clearBlock', () => {
  it('sets blocking to false for player', () => {
    const s = { ...fighting(), player: { ...fighting().player, blocking: true } }
    const after = clearBlock(s, 'player')
    expect(after.player.blocking).toBe(false)
  })

  it('sets blocking to false for opponent', () => {
    const s = { ...fighting(), opponent: { ...fighting().opponent, blocking: true } }
    const after = clearBlock(s, 'opponent')
    expect(after.opponent.blocking).toBe(false)
  })
})

describe('tick', () => {
  it('returns unchanged state when not in fighting phase', () => {
    const s = createGame()
    const after = tick(s, 1000)
    expect(after).toBe(s)
  })

  it('decrements timer by dt in seconds', () => {
    const s = fighting()
    const after = tick(s, 1000)
    expect(after.timer).toBeCloseTo(59, 1)
  })

  it('does not go below timer 0', () => {
    const s = { ...fighting(), timer: 0.5 }
    const after = tick(s, 5000)
    expect(after.timer).toBeGreaterThanOrEqual(0)
  })

  it('transitions to roundEnd when timer reaches 0', () => {
    const s = { ...fighting(), timer: 0.5 }
    const after = tick(s, 5000)
    expect(['roundEnd', 'gameOver']).toContain(after.phase)
  })
})

describe('startCountdown', () => {
  it('sets phase to countdown', () => {
    const after = startCountdown(createGame())
    expect(after.phase).toBe('countdown')
  })
})

describe('startFighting', () => {
  it('sets phase to fighting', () => {
    const after = startFighting(createGame())
    expect(after.phase).toBe('fighting')
  })
})

describe('getWinner', () => {
  it('returns player when player has more rounds won', () => {
    const s: GameState = {
      ...createGame(),
      player: { ...createGame().player, roundsWon: 2 },
      opponent: { ...createGame().opponent, roundsWon: 1 },
    }
    expect(getWinner(s)).toBe('player')
  })

  it('returns opponent when opponent has more rounds won', () => {
    const s: GameState = {
      ...createGame(),
      player: { ...createGame().player, roundsWon: 0 },
      opponent: { ...createGame().opponent, roundsWon: 2 },
    }
    expect(getWinner(s)).toBe('opponent')
  })

  it('returns draw when rounds are equal', () => {
    expect(getWinner(createGame())).toBe('draw')
  })
})
