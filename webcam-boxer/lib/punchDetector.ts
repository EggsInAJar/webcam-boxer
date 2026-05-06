import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LM } from './mediapipe'
import type { PunchType } from './types'

// ── Tuning ───────────────────────────────────────────────────────────────────

// MediaPipe keeps reporting landmark positions even when they leave the frame —
// it extrapolates / hallucinates coordinates with garbage z values.
// Gate every detection on visibility + presence first.
const MIN_VISIBILITY = 0.55  // landmark.visibility must exceed this
const MIN_PRESENCE   = 0.55  // landmark.presence must exceed this

const STILLNESS_PER_FRAME = 0.016  // max per-frame wrist speed for "standing still"
const THRESHOLD           = 0.09   // net displacement over HISTORY frames (normalized)
const CONSISTENCY_MIN     = 4      // frames in HISTORY that must move in punch direction

const HISTORY          = 6
const BUFFER_SIZE      = 10
const COOLDOWN_MS      = 550
const GLOBAL_COOLDOWN  = 350

// ── Helpers ──────────────────────────────────────────────────────────────────

type Frame = NormalizedLandmark[]

export type PunchEvent = {
  type: PunchType
  hand: 'left' | 'right'
  timestamp: number
}

/** Returns false if MediaPipe thinks this landmark is out of frame or occluded */
function visible(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
  if (!lm) return false
  const v = lm.visibility ?? 1
  const p = (lm as any).presence ?? 1
  return v >= MIN_VISIBILITY && p >= MIN_PRESENCE
}

function dist2d(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function consistentFrames(
  buffer: Frame[],
  lmIdx: number,
  axis: 'x' | 'y' | 'z',
  sign: 1 | -1
): number {
  let count = 0
  for (let i = buffer.length - HISTORY; i < buffer.length - 1; i++) {
    const a = buffer[i]?.[lmIdx]
    const b = buffer[i + 1]?.[lmIdx]
    // Only count frames where both landmarks are actually visible
    if (visible(a) && visible(b) && sign * (b[axis] - a[axis]) > 0) count++
  }
  return count
}

/** Max per-frame wrist speed, only counting frames where the wrist is visible */
function maxVisibleWristSpeed(buffer: Frame[], lookback = 4): number {
  let max = 0
  const start = Math.max(0, buffer.length - lookback)
  for (let i = start; i < buffer.length - 1; i++) {
    const l0 = buffer[i]?.[LM.LEFT_WRIST]
    const l1 = buffer[i + 1]?.[LM.LEFT_WRIST]
    const r0 = buffer[i]?.[LM.RIGHT_WRIST]
    const r1 = buffer[i + 1]?.[LM.RIGHT_WRIST]
    if (visible(l0) && visible(l1)) max = Math.max(max, Math.hypot(l1.x - l0.x, l1.y - l0.y))
    if (visible(r0) && visible(r1)) max = Math.max(max, Math.hypot(r1.x - r0.x, r1.y - r0.y))
  }
  return max
}

// ── PunchDetector ────────────────────────────────────────────────────────────

export class PunchDetector {
  private buffer: Frame[] = []
  private cooldowns = { left: 0, right: 0 }
  private lastAnyPunch = 0
  private shoulderWidth = 0.3

  pushFrame(landmarks: NormalizedLandmark[]): PunchEvent | null {
    this.buffer.push(landmarks)
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift()
    if (this.buffer.length < HISTORY + 2) return null

    const now = performance.now()
    if (now - this.lastAnyPunch < GLOBAL_COOLDOWN) return null

    const current = landmarks
    const past = this.buffer[this.buffer.length - 1 - HISTORY]

    const ls = current[LM.LEFT_SHOULDER]
    const rs = current[LM.RIGHT_SHOULDER]
    const lw = current[LM.LEFT_WRIST]
    const rw = current[LM.RIGHT_WRIST]
    const lwp = past[LM.LEFT_WRIST]
    const rwp = past[LM.RIGHT_WRIST]

    // Shoulders must be visible for normalization to be valid
    if (!visible(ls) || !visible(rs)) return null

    // Update shoulder width while both shoulders are clearly visible
    const sw = Math.abs(rs.x - ls.x)
    if (sw > 0.05) this.shoulderWidth = sw
    const norm = this.shoulderWidth

    // ── Stillness guard (only counts visible wrist frames) ──────────────────
    if (maxVisibleWristSpeed(this.buffer, 4) < STILLNESS_PER_FRAME) return null

    // Per-hand visibility gate — a hand out of frame cannot punch
    const leftVisible  = visible(lw) && visible(lwp)
    const rightVisible = visible(rw) && visible(rwp)

    // No visible wrists at all → nothing to classify
    if (!leftVisible && !rightVisible) return null

    const leftFree  = leftVisible  && now - this.cooldowns.left  > COOLDOWN_MS
    const rightFree = rightVisible && now - this.cooldowns.right > COOLDOWN_MS

    // Net deltas (normalized)
    const ldx = leftVisible  ? (lw!.x - lwp!.x) / norm : 0
    const ldy = leftVisible  ? (lw!.y - lwp!.y) / norm : 0
    const ldz = leftVisible  ? (lw!.z - lwp!.z)        : 0
    const rdx = rightVisible ? (rw!.x - rwp!.x) / norm : 0
    const rdy = rightVisible ? (rw!.y - rwp!.y) / norm : 0
    const rdz = rightVisible ? (rw!.z - rwp!.z)        : 0

    const lExt = leftVisible  ? dist2d(lw!, ls) - dist2d(lwp!, ls) : 0
    const rExt = rightVisible ? dist2d(rw!, rs) - dist2d(rwp!, rs) : 0

    const fire = (type: PunchType, hand: 'left' | 'right'): PunchEvent => {
      this.cooldowns[hand] = now
      this.lastAnyPunch = now
      return { type, hand, timestamp: now }
    }

    // ── Block ────────────────────────────────────────────────────────────────
    // Both wrists must be visible AND clearly above their shoulders
    if (leftVisible && rightVisible && lw!.y < ls.y - 0.08 && rw!.y < rs.y - 0.08) {
      return fire('block', 'left')
    }

    // ── Uppercut ─────────────────────────────────────────────────────────────
    const UPPER_T = THRESHOLD * 1.5
    if (leftFree && -ldy > UPPER_T && Math.abs(ldx) < THRESHOLD * 0.8) {
      if (consistentFrames(this.buffer, LM.LEFT_WRIST, 'y', -1) >= CONSISTENCY_MIN)
        return fire('uppercut', 'left')
    }
    if (rightFree && -rdy > UPPER_T && Math.abs(rdx) < THRESHOLD * 0.8) {
      if (consistentFrames(this.buffer, LM.RIGHT_WRIST, 'y', -1) >= CONSISTENCY_MIN)
        return fire('uppercut', 'right')
    }

    // ── Hook ─────────────────────────────────────────────────────────────────
    const HOOK_T = THRESHOLD * 1.2
    if (leftFree && Math.abs(ldx) > HOOK_T && Math.abs(ldx) > Math.abs(ldy) * 1.8) {
      const sign: 1 | -1 = ldx > 0 ? 1 : -1
      if (consistentFrames(this.buffer, LM.LEFT_WRIST, 'x', sign) >= CONSISTENCY_MIN)
        return fire('hook', 'left')
    }
    if (rightFree && Math.abs(rdx) > HOOK_T && Math.abs(rdx) > Math.abs(rdy) * 1.8) {
      const sign: 1 | -1 = rdx > 0 ? 1 : -1
      if (consistentFrames(this.buffer, LM.RIGHT_WRIST, 'x', sign) >= CONSISTENCY_MIN)
        return fire('hook', 'right')
    }

    // ── Jab / Cross ──────────────────────────────────────────────────────────
    // Require BOTH z decreasing AND 2D extension increasing.
    // z alone is garbage when the hand re-enters the frame edge.
    const JAB_Z   = 0.07
    const JAB_EXT = 0.03
    const JAB_X   = THRESHOLD

    if (leftFree && ldz < -JAB_Z && lExt > JAB_EXT && Math.abs(ldx) < JAB_X) {
      if (consistentFrames(this.buffer, LM.LEFT_WRIST, 'z', -1) >= CONSISTENCY_MIN - 1)
        return fire('jab', 'left')
    }
    if (rightFree && rdz < -JAB_Z && rExt > JAB_EXT && Math.abs(rdx) < JAB_X) {
      if (consistentFrames(this.buffer, LM.RIGHT_WRIST, 'z', -1) >= CONSISTENCY_MIN - 1)
        return fire('cross', 'right')
    }

    return null
  }

  reset() {
    this.buffer = []
    this.cooldowns = { left: 0, right: 0 }
    this.lastAnyPunch = 0
  }

  getShoulderWidth() {
    return this.shoulderWidth
  }
}
