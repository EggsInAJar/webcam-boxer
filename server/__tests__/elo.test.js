import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { expectedScore, applyElo } from '../lib/elo.js'

describe('expectedScore', () => {
  it('returns 0.5 for equal ratings', () => {
    assert.equal(expectedScore(1200, 1200), 0.5)
  })

  it('returns > 0.5 when player A is rated higher', () => {
    assert.ok(expectedScore(1400, 1200) > 0.5)
  })

  it('returns < 0.5 when player A is rated lower', () => {
    assert.ok(expectedScore(1000, 1200) < 0.5)
  })

  it('scores are symmetric (eA + eB = 1)', () => {
    const eA = expectedScore(1300, 1100)
    const eB = expectedScore(1100, 1300)
    assert.ok(Math.abs(eA + eB - 1) < 1e-9)
  })

  it('returns ~0.76 when advantage is 200 points', () => {
    const e = expectedScore(1400, 1200)
    assert.ok(Math.abs(e - 0.7597) < 0.001, `expected ~0.76, got ${e}`)
  })
})

describe('applyElo', () => {
  it('winner gains and loser loses the same amount', () => {
    const { deltaA, deltaB } = applyElo(1200, 1200, 1, 0)
    assert.equal(deltaA, -deltaB)
    assert.ok(deltaA > 0)
  })

  it('equal-rated players exchange ~16 rating on a win (K=32)', () => {
    const { deltaA } = applyElo(1200, 1200, 1, 0)
    assert.ok(Math.abs(deltaA - 16) < 1, `expected ~16, got ${deltaA}`)
  })

  it('draw between equal-rated players produces 0 delta', () => {
    const { deltaA, deltaB } = applyElo(1200, 1200, 0.5, 0.5)
    assert.equal(deltaA, 0)
    assert.equal(deltaB, 0)
  })

  it('upset win (underdog beats favorite) gives larger rating gain', () => {
    const normalWin = applyElo(1200, 1200, 1, 0)
    const upsetWin  = applyElo(1000, 1200, 1, 0)
    assert.ok(upsetWin.deltaA > normalWin.deltaA, 'upset should give more rating')
  })

  it('floors ratings at 100', () => {
    // 105 vs 200: eA≈0.58, deltaA = round(32*(0-0.58)) = -19, 105-19=86 → floored to 100
    const { newA } = applyElo(105, 200, 0, 1)
    assert.equal(newA, 100)
  })

  it('accepts a custom K factor', () => {
    const k16 = applyElo(1200, 1200, 1, 0, 16)
    assert.ok(Math.abs(k16.deltaA - 8) < 1, `K=16 expected ~8, got ${k16.deltaA}`)
  })

  it('new ratings equal old + delta', () => {
    const rA = 1300, rB = 1100
    const { newA, newB, deltaA, deltaB } = applyElo(rA, rB, 1, 0)
    assert.equal(newA, rA + deltaA)
    assert.equal(newB, rB + deltaB)
  })
})
