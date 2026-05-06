import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRoomState,
  applyPunchToState,
  resolveRound,
  setBlocking,
  clearBlocking,
} from '../lib/gameState.js'

describe('createRoomState', () => {
  it('creates two sides with full HP at round 1', () => {
    const state = createRoomState('guest-a', 'guest-b')
    assert.equal(state.sides.left.hp, 100)
    assert.equal(state.sides.right.hp, 100)
    assert.equal(state.round, 1)
    assert.equal(state.phase, 'fighting')
  })

  it('assigns guestIds to the correct sides', () => {
    const state = createRoomState('guest-a', 'guest-b')
    assert.equal(state.sides.left.guestId, 'guest-a')
    assert.equal(state.sides.right.guestId, 'guest-b')
  })
})

describe('applyPunchToState', () => {
  it('deals damage to the opponent side', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'left', 'jab')
    assert.equal(next.sides.right.hp, 95) // 100 - 5
    assert.equal(next.sides.left.hp, 100) // attacker untouched
  })

  it('cross deals 12 damage', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'right', 'cross')
    assert.equal(next.sides.left.hp, 88)
  })

  it('hook deals 10 damage', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'left', 'hook')
    assert.equal(next.sides.right.hp, 90)
  })

  it('uppercut deals 15 damage', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'left', 'uppercut')
    assert.equal(next.sides.right.hp, 85)
  })

  it('blocked punch deals half damage (rounded)', () => {
    const state = createRoomState('a', 'b')
    const blocking = setBlocking(state, 'right', true)
    const next = applyPunchToState(blocking, 'left', 'cross') // 12 * 0.5 = 6
    assert.equal(next.sides.right.hp, 94)
  })

  it('does not let HP drop below 0', () => {
    let state = createRoomState('a', 'b')
    for (let i = 0; i < 10; i++) state = applyPunchToState(state, 'left', 'uppercut')
    assert.equal(state.sides.right.hp, 0)
  })

  it('unknown punch type returns state unchanged', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'left', 'flying-kick')
    assert.equal(next.sides.right.hp, 100)
  })

  it('block punch sets sender blocking flag, not damage', () => {
    const state = createRoomState('a', 'b')
    const next = applyPunchToState(state, 'left', 'block')
    assert.equal(next.sides.left.blocking, true)
    assert.equal(next.sides.right.hp, 100)
  })
})

describe('resolveRound', () => {
  it('awards round to side with higher HP', () => {
    let state = createRoomState('a', 'b')
    state = applyPunchToState(state, 'left', 'jab') // right takes 5 damage
    const resolved = resolveRound(state)
    assert.equal(resolved.sides.left.roundsWon, 1)
    assert.equal(resolved.sides.right.roundsWon, 0)
    assert.equal(resolved.roundWinner, 'left')
  })

  it('awards no round on an exact tie', () => {
    const state = createRoomState('a', 'b')
    const resolved = resolveRound(state)
    assert.equal(resolved.sides.left.roundsWon, 0)
    assert.equal(resolved.sides.right.roundsWon, 0)
    assert.equal(resolved.roundWinner, null)
  })

  it('resets HP to 100 for next round', () => {
    let state = createRoomState('a', 'b')
    state = applyPunchToState(state, 'left', 'uppercut')
    const resolved = resolveRound(state)
    assert.equal(resolved.sides.left.hp, 100)
    assert.equal(resolved.sides.right.hp, 100)
  })

  it('advances to roundEnd phase when match not over', () => {
    const state = createRoomState('a', 'b')
    const resolved = resolveRound(state)
    assert.equal(resolved.phase, 'roundEnd')
    assert.equal(resolved.round, 2)
  })

  it('transitions to gameOver when a player wins majority of rounds', () => {
    let state = createRoomState('a', 'b')
    // Left wins rounds 1 and 2
    state = { ...state, sides: { ...state.sides, left: { ...state.sides.left, roundsWon: 1 } } }
    state = applyPunchToState(state, 'left', 'jab')
    const resolved = resolveRound(state)
    assert.equal(resolved.phase, 'gameOver')
    assert.equal(resolved.matchWinner, 'left')
  })

  it('transitions to gameOver at max rounds even with a tied score', () => {
    let state = createRoomState('a', 'b')
    state = { ...state, round: 3, sides: {
      left:  { ...state.sides.left,  roundsWon: 1 },
      right: { ...state.sides.right, roundsWon: 1 },
    }}
    const resolved = resolveRound(state)
    assert.equal(resolved.phase, 'gameOver')
  })
})
