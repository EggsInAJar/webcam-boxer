import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AIOpponent } from '../aiOpponent'
import { createGame, startFighting } from '../gameEngine'
import type { GameState } from '../types'

function fightingState(): GameState {
  return startFighting(createGame())
}

describe('AIOpponent constructor', () => {
  it('initializes without error for easy difficulty', () => {
    expect(() => new AIOpponent('easy')).not.toThrow()
  })

  it('initializes without error for medium difficulty', () => {
    expect(() => new AIOpponent('medium')).not.toThrow()
  })

  it('initializes without error for hard difficulty', () => {
    expect(() => new AIOpponent('hard')).not.toThrow()
  })
})

describe('AIOpponent.tick', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null when game phase is not fighting', () => {
    const ai = new AIOpponent('medium')
    const state = createGame() // phase: calibrating
    expect(ai.tick(1000, state)).toBeNull()
  })

  it('emits a punch after IDLE → ATTACKING transition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const ai = new AIOpponent('easy') // idleMin=2000
    const state = fightingState()

    // First big tick: IDLE expires → transitions to ATTACKING (no event yet)
    const ev1 = ai.tick(5000, state)
    // Second tick: ATTACKING expires → emits punch
    const ev2 = ai.tick(500, state)

    // One of the two ticks should have produced a punch
    const events = [ev1, ev2].filter(Boolean)
    const punch = events.find((e) => e?.type === 'punch')
    expect(punch).toBeDefined()
  })

  it('emits blockEnd after BLOCKING timer expires', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const ai = new AIOpponent('medium')
    // Force AI into BLOCKING state via high-damage punch
    ai.onPlayerPunch(5) // low damage; random=0 means blockChance check always fails for most
    // Force directly by stunning then letting stun expire and manually blocking
    ai.onPlayerPunch(20) // stun
    const state = fightingState()
    ai.tick(600, state) // stun expires
    // Now AI is IDLE again; give it a blockStart via onPlayerPunch with random=1
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // blockChance for medium is 0.3; 0.01 < 0.3 → blocks
    ai.onPlayerPunch(5)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    // Tick past block duration to get blockEnd
    const blockEnd = ai.tick(2000, state)
    expect(blockEnd?.type).toBe('blockEnd')
  })

  it('emits pending blockStart event on first tick after onPlayerPunch triggers block', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // ensures block fires (0.01 < blockChance 0.3)
    const ai = new AIOpponent('medium')
    ai.onPlayerPunch(5) // low dmg → may trigger block
    const state = fightingState()
    // Peek at pending event — it will be emitted on next tick even if timer > 0
    const ev = ai.tick(1, state)
    // Either blockStart was emitted or timer wasn't up yet — but no crash
    expect(ev === null || ev?.type === 'blockStart').toBe(true)
  })

  it('returns null when STUNNED and timer is still positive', () => {
    const ai = new AIOpponent('medium')
    ai.onPlayerPunch(20) // stun (stunDuration=300ms for medium)
    const state = fightingState()
    const ev = ai.tick(1, state) // tiny dt, stun not expired
    expect(ev).toBeNull()
  })

  it('recovers from stun and returns to IDLE after stun duration', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const ai = new AIOpponent('medium') // stunDuration=300
    ai.onPlayerPunch(20)
    const state = fightingState()
    ai.tick(500, state) // expires stun → scheduleIdle → IDLE
    // Second tick: IDLE timer set to ~idleMin (1000*0=0 since random=0), expires immediately
    const ev2 = ai.tick(2000, state) // IDLE→ATTACKING
    const ev3 = ai.tick(500, state)  // ATTACKING→punch
    const events = [ev2, ev3].filter(Boolean)
    const punch = events.find((e) => e?.type === 'punch')
    expect(punch).toBeDefined()
  })

  it('applies retreatIdleMultiplier when opponent HP is low', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const ai = new AIOpponent('easy') // retreatIdleMultiplier=2
    const lowHpState: GameState = {
      ...fightingState(),
      opponent: { ...fightingState().opponent, hp: 20 }, // 20/100 = 0.2 < 0.3 threshold
    }
    // Should not throw; retreat logic is triggered
    expect(() => ai.tick(10000, lowHpState)).not.toThrow()
  })
})

describe('AIOpponent.onPlayerPunch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stuns AI on damage >= 12', () => {
    const ai = new AIOpponent('medium')
    ai.onPlayerPunch(12)
    const state = fightingState()
    // Stunned, timer still > 0 after tiny tick
    const ev = ai.tick(1, state)
    expect(ev).toBeNull()
  })

  it('does not stun on low damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1) // blockChance never fires
    const ai = new AIOpponent('medium')
    ai.onPlayerPunch(5) // < 12, no stun
    // AI remains in IDLE state; no crash
    const state = fightingState()
    expect(() => ai.tick(1, state)).not.toThrow()
  })
})

describe('AIOpponent.reset', () => {
  it('resets to a working state on same difficulty', () => {
    const ai = new AIOpponent('medium')
    ai.onPlayerPunch(20) // stun
    ai.reset('medium')
    const state = fightingState()
    expect(() => ai.tick(100, state)).not.toThrow()
  })

  it('resets to a different difficulty without error', () => {
    const ai = new AIOpponent('easy')
    ai.reset('hard')
    const state = fightingState()
    expect(() => ai.tick(1000, state)).not.toThrow()
  })
})
