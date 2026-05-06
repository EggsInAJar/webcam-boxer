import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeEloUpdate } from '../lib/db.js'

describe('computeEloUpdate', () => {
  it('left winner gains positive delta, right loses matching', () => {
    const r = computeEloUpdate(1200, 1200, 'left')
    assert.ok(r.deltaA > 0, 'winner should gain')
    assert.ok(r.deltaB < 0, 'loser should lose')
    assert.equal(r.deltaA, -r.deltaB)
  })

  it('right winner gains positive delta', () => {
    const r = computeEloUpdate(1200, 1200, 'right')
    assert.ok(r.deltaA < 0)
    assert.ok(r.deltaB > 0)
  })

  it('draw produces zero delta for equal-rated players', () => {
    const r = computeEloUpdate(1200, 1200, null)
    assert.equal(r.deltaA, 0)
    assert.equal(r.deltaB, 0)
  })

  it('equal-rated match produces ~16 point swing', () => {
    const r = computeEloUpdate(1200, 1200, 'left')
    assert.ok(Math.abs(r.deltaA - 16) < 1, `expected ~16, got ${r.deltaA}`)
  })

  it('upset win (underdog wins) gives larger gain than expected win', () => {
    const normal = computeEloUpdate(1200, 1200, 'left')
    const upset  = computeEloUpdate(1000, 1200, 'left') // underdog is A
    assert.ok(upset.deltaA > normal.deltaA)
  })

  it('new ratings equal old + delta', () => {
    const rA = 1350, rB = 1100
    const r = computeEloUpdate(rA, rB, 'right')
    assert.equal(r.newRatingA, rA + r.deltaA)
    assert.equal(r.newRatingB, rB + r.deltaB)
  })

  it('ratings are floored at 100', () => {
    const r = computeEloUpdate(105, 200, 'right') // A loses to B, A should drop below 100
    assert.equal(r.newRatingA, 100)
  })
})
