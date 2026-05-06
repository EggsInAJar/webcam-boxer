'use client'

import { useEffect, useRef } from 'react'
import type { GameState } from '@/lib/types'

type Props = {
  gameState: GameState
  /** When true: transparent bg, no player sprite — your webcam IS the player */
  webcamMode?: boolean
  className?: string
}

type DmgParticle = {
  id: number
  x: number
  y: number
  value: number
  blocked: boolean
  startTime: number
  driftX: number   // random horizontal drift
}

const W = 800
const H = 400

const PLAYER_X = 200
const OPP_X    = 600
const FLOOR_Y  = 340

const COL = {
  bg:          '#0a0a0a',
  floorLine:   '#FFD700',
  oppBody:     '#FF1744',
  oppDark:     '#8B0000',
  playerBody:  '#00E676',
  playerDark:  '#007832',
  skin:        '#F5CBA7',
  white:       '#F5F5F5',
  gold:        '#FFD700',
  red:         '#FF1744',
}

export default function GameCanvas({ gameState, webcamMode = false, className = '' }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const stateRef       = useRef(gameState)
  const rafRef         = useRef<number>(0)
  const particlesRef   = useRef<DmgParticle[]>([])
  const lastHitTimeRef = useRef(0)

  stateRef.current = gameState

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })!
    let start: number | null = null

    function draw(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const state = stateRef.current

      // Spawn a new damage particle whenever a new hit lands
      if (state.lastHitTime !== lastHitTimeRef.current && state.lastHitDamage > 0 && state.hitTarget) {
        lastHitTimeRef.current = state.lastHitTime
        const targetX = state.hitTarget === 'opponent' ? OPP_X : PLAYER_X
        particlesRef.current.push({
          id: ts,
          x: targetX + (Math.random() - 0.5) * 50,
          y: FLOOR_Y - 110 - Math.random() * 40,
          value: state.lastHitDamage,
          blocked: state.lastHitText?.includes('blocked') ?? false,
          startTime: ts,
          driftX: (Math.random() - 0.5) * 60,
        })
      }

      ctx.clearRect(0, 0, W, H)

      if (webcamMode) {
        drawWebcamBackground(ctx, state, ts)
      } else {
        drawOpaqueBackground(ctx)
      }

      drawFloor(ctx, webcamMode)
      drawFighters(ctx, state, elapsed, ts, webcamMode)
      drawDamageParticles(ctx, ts, particlesRef.current)
      drawPhaseOverlay(ctx, state)

      // Remove expired particles
      particlesRef.current = particlesRef.current.filter(p => ts - p.startTime < 900)

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [webcamMode])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className={`w-full ${className}`}
      style={{ imageRendering: 'pixelated', background: 'transparent' }}
    />
  )
}

// ── Backgrounds ────────────────────────────────────────────────────────────

function drawOpaqueBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,215,0,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
}

function drawWebcamBackground(ctx: CanvasRenderingContext2D, state: GameState, ts: number) {
  // Left half is fully transparent — the clipped webcam shows through.
  // Right half gets a solid dark background so the opponent sprite reads cleanly.
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(W / 2, 0, W / 2, H)

  // Subtle grid on the right panel only
  ctx.strokeStyle = 'rgba(255,215,0,0.04)'
  ctx.lineWidth = 1
  for (let x = W / 2; x <= W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Short blend seam where webcam meets dark panel
  const seam = ctx.createLinearGradient(W * 0.44, 0, W * 0.5, 0)
  seam.addColorStop(0, 'rgba(13,13,13,0)')
  seam.addColorStop(1, 'rgba(13,13,13,1)')
  ctx.fillStyle = seam
  ctx.fillRect(W * 0.44, 0, W * 0.06, H)

  // Dashed center divider
  ctx.strokeStyle = 'rgba(255,215,0,0.18)'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 9])
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
  ctx.setLineDash([])

  // Red flash on the left (webcam/player) side when player takes a hit
  const hitAge = ts - state.lastHitTime
  if (state.hitTarget === 'player' && hitAge < 140) {
    const alpha = (1 - hitAge / 140) * 0.5
    const leftFlash = ctx.createLinearGradient(0, 0, W / 2, 0)
    leftFlash.addColorStop(0,   `rgba(255,23,68,${alpha})`)
    leftFlash.addColorStop(0.7, `rgba(255,23,68,${alpha * 0.25})`)
    leftFlash.addColorStop(1,   'rgba(255,23,68,0)')
    ctx.fillStyle = leftFlash
    ctx.fillRect(0, 0, W / 2, H)
  }
}

// ── Floor ──────────────────────────────────────────────────────────────────

function drawFloor(ctx: CanvasRenderingContext2D, subtle: boolean) {
  const grad = ctx.createLinearGradient(0, FLOOR_Y - 20, 0, H)
  grad.addColorStop(0, subtle ? 'rgba(255,215,0,0.04)' : 'rgba(255,215,0,0.06)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)

  ctx.strokeStyle = subtle ? 'rgba(255,215,0,0.35)' : COL.floorLine
  ctx.lineWidth = subtle ? 2 : 3
  ctx.setLineDash(subtle ? [12, 8] : [])
  ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(W, FLOOR_Y); ctx.stroke()
  ctx.setLineDash([])
}

// ── Fighters ───────────────────────────────────────────────────────────────

function drawFighters(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  elapsed: number,
  ts: number,
  webcamMode: boolean
) {
  const { player, opponent } = state
  const hitAge = ts - state.lastHitTime

  // Opponent (right side, always drawn)
  const oppBob      = Math.sin(elapsed * 0.005 + Math.PI) * 4
  const oppPunching = ts - opponent.lastPunchTime < 300
  drawFighter(ctx, OPP_X, FLOOR_Y + oppBob, COL.oppBody, COL.oppDark, -1, oppPunching, opponent.blocking)
  if (state.hitTarget === 'opponent' && hitAge < 80) {
    drawFighterFlash(ctx, OPP_X, FLOOR_Y + oppBob)
  }

  if (webcamMode) {
    // In webcam mode: player IS the webcam. Just show a "YOU" label + hit flash.
    drawYouIndicator(ctx, state, elapsed)
  } else {
    // Opaque mode: draw the player sprite
    const bob          = Math.sin(elapsed * 0.005) * 4
    const playerPunching = ts - player.lastPunchTime < 300
    drawFighter(ctx, PLAYER_X, FLOOR_Y + bob, COL.playerBody, COL.playerDark, 1, playerPunching, player.blocking)
    if (state.hitTarget === 'player' && hitAge < 80) {
      drawFighterFlash(ctx, PLAYER_X, FLOOR_Y + bob)
    }
  }

  // Hit label (floats up from target)
  if (state.lastHitText && hitAge < 800) {
    const alpha  = hitAge < 400 ? 1 : 1 - (hitAge - 400) / 400
    const yOff   = -hitAge * 0.06
    const targetX = state.hitTarget === 'opponent' ? OPP_X : PLAYER_X
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font      = 'bold 14px "Press Start 2P", monospace'
    ctx.fillStyle = state.hitTarget === 'opponent' ? COL.gold : COL.red
    ctx.textAlign = 'center'
    ctx.fillText(state.lastHitText.toUpperCase(), targetX, FLOOR_Y - 120 + yOff)
    ctx.restore()
  }
}

function drawYouIndicator(ctx: CanvasRenderingContext2D, state: GameState, elapsed: number) {
  // Subtle green bracket on the left to mark "you"
  const pulse = 0.55 + Math.sin(elapsed * 0.003) * 0.15
  ctx.save()
  ctx.globalAlpha = pulse
  ctx.strokeStyle = '#00E676'
  ctx.lineWidth = 2
  const bx = PLAYER_X - 55
  const by = FLOOR_Y - 230
  const bw = 110
  const bh = 240
  const arm = 18
  // Corner brackets only
  ctx.beginPath()
  ctx.moveTo(bx + arm, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + arm)
  ctx.moveTo(bx + bw - arm, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + arm)
  ctx.moveTo(bx, by + bh - arm); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + arm, by + bh)
  ctx.moveTo(bx + bw, by + bh - arm); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - arm, by + bh)
  ctx.stroke()
  ctx.restore()

  // "YOU" label
  ctx.save()
  ctx.font      = 'bold 9px "Press Start 2P", monospace'
  ctx.fillStyle = '#00E676'
  ctx.textAlign = 'center'
  ctx.globalAlpha = 0.8
  ctx.fillText('YOU', PLAYER_X, FLOOR_Y + 22)
  ctx.restore()
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  bodyColor: string,
  bodyDark: string,
  dir: 1 | -1,
  punching: boolean,
  blocking: boolean
) {
  const headY    = floorY - 120
  const torsoTop = headY + 28
  const torsoBot = floorY - 40

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.beginPath()
  ctx.ellipse(x, floorY + 4, 32, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  // Legs
  ctx.strokeStyle = bodyDark; ctx.lineWidth = 10; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x - 10, torsoBot); ctx.lineTo(x - 14, floorY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + 10, torsoBot); ctx.lineTo(x + 14, floorY); ctx.stroke()
  ctx.fillStyle = bodyDark
  ctx.fillRect(x - 22 + dir * 2, floorY - 4, 18, 8)
  ctx.fillRect(x + 4  + dir * 2, floorY - 4, 18, 8)

  // Torso
  ctx.fillStyle = bodyColor
  roundRect(ctx, x - 22, torsoTop, 44, torsoBot - torsoTop, 6); ctx.fill()
  ctx.strokeStyle = bodyDark; ctx.lineWidth = 3
  roundRect(ctx, x - 22, torsoTop, 44, torsoBot - torsoTop, 6); ctx.stroke()

  // Arms
  ctx.strokeStyle = bodyColor; ctx.lineWidth = 10; ctx.lineCap = 'round'
  if (blocking) {
    const bx = x + dir * 30
    ctx.beginPath(); ctx.moveTo(x + dir * 10, torsoTop + 10); ctx.lineTo(bx, torsoTop + 30); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x + dir * 10, torsoTop + 30); ctx.lineTo(bx - dir * 10, torsoTop + 10); ctx.stroke()
  } else if (punching) {
    const extX = x + dir * 60
    ctx.beginPath(); ctx.moveTo(x + dir * 10, torsoTop + 20); ctx.lineTo(extX, torsoTop + 10); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - dir * 10, torsoTop + 20); ctx.lineTo(x - dir * 20, torsoTop + 40); ctx.stroke()
    ctx.fillStyle = COL.gold
    ctx.beginPath(); ctx.arc(extX, torsoTop + 10, 11, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#B8960C'; ctx.lineWidth = 3; ctx.stroke()
  } else {
    const guardX = x + dir * 28
    ctx.beginPath(); ctx.moveTo(x + dir * 12, torsoTop + 10); ctx.lineTo(guardX, torsoTop + 20); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - dir *  8, torsoTop + 20); ctx.lineTo(x - dir * 20, torsoTop + 36); ctx.stroke()
    ctx.fillStyle = COL.gold
    ctx.beginPath(); ctx.arc(guardX,       torsoTop + 20, 9, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x - dir * 20, torsoTop + 36, 9, 0, Math.PI * 2); ctx.fill()
  }

  // Head
  ctx.fillStyle = COL.skin
  ctx.beginPath(); ctx.arc(x, headY, 20, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = bodyDark; ctx.lineWidth = 3; ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.beginPath(); ctx.arc(x + dir * 8, headY - 3, 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = bodyColor; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(x, headY, 20, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke()
}

function drawFighterFlash(ctx: CanvasRenderingContext2D, x: number, floorY: number) {
  ctx.save()
  ctx.globalAlpha = 0.7
  ctx.fillStyle = COL.white
  ctx.beginPath()
  ctx.ellipse(x, floorY - 60, 35, 70, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ── Phase overlays ─────────────────────────────────────────────────────────

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, state: GameState) {
  const { phase } = state

  if (phase === 'calibrating') {
    centeredText(ctx, 'GET IN POSITION', W / 2, H / 2 - 20, '#FFD700', 16)
    centeredText(ctx, 'UPPER BODY MUST BE VISIBLE', W / 2, H / 2 + 20, 'rgba(255,255,255,0.5)', 8)
    return
  }

  if (phase === 'countdown') {
    ctx.save()
    ctx.font      = 'bold 80px "Press Start 2P", monospace'
    ctx.fillStyle = '#FFD700'
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.95
    ctx.fillText(String(Math.ceil(state.timer)), W / 2, H / 2 + 28)
    ctx.restore()
    return
  }

  if (phase === 'roundEnd') {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, 0, W, H)
    centeredText(ctx, `ROUND ${state.round - 1} OVER`,     W / 2, H / 2 - 20, '#FFD700', 18)
    centeredText(ctx, `ROUND ${state.round} STARTING...`,  W / 2, H / 2 + 20, 'rgba(255,255,255,0.6)', 10)
    ctx.restore()
    return
  }

  if (phase === 'gameOver') {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.88)'
    ctx.fillRect(0, 0, W, H)
    const won   = state.player.roundsWon > state.opponent.roundsWon
    const draw  = state.player.roundsWon === state.opponent.roundsWon
    const label = won ? 'YOU WIN!' : draw ? 'DRAW!' : 'K.O.!'
    const color = won ? '#00E676' : draw ? '#FFD700' : '#FF1744'
    centeredText(ctx, label, W / 2, H / 2 - 20, color, 28)
    centeredText(ctx, `${state.player.roundsWon} - ${state.opponent.roundsWon}`, W / 2, H / 2 + 30, '#F5F5F5', 16)
    ctx.restore()
  }
}

// ── Damage number particles ────────────────────────────────────────────────

const DMG_COLORS: Record<number, string> = {
  5:  '#FFFFFF',  // jab    — white
  10: '#FFD700',  // hook   — gold
  12: '#FF6B35',  // cross  — orange
  15: '#FF1744',  // uppercut — red
}

function dmgColor(value: number, blocked: boolean): string {
  if (blocked) return '#888888'
  // Find closest key
  const keys = Object.keys(DMG_COLORS).map(Number)
  const closest = keys.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a)
  return DMG_COLORS[closest] ?? '#FFFFFF'
}

function drawDamageParticles(ctx: CanvasRenderingContext2D, now: number, particles: DmgParticle[]) {
  for (const p of particles) {
    const age      = now - p.startTime
    const dur      = 900
    const t        = age / dur   // 0 → 1

    if (t >= 1) continue

    // Arc upward + slight drift
    const x = p.x + p.driftX * t
    const y = p.y - 100 * t - 30 * t * t  // parabola: fast up, slows

    // Scale: overshoot bounce — grows to 1.6× then settles to 1.2× then shrinks
    let scale: number
    if (t < 0.12)      scale = 1 + (t / 0.12) * 0.8          // pop in 0→1.8×
    else if (t < 0.25) scale = 1.8 - ((t - 0.12) / 0.13) * 0.5 // bounce back 1.8→1.3×
    else if (t < 0.35) scale = 1.3 + ((t - 0.25) / 0.10) * 0.1 // slight re-pop 1.3→1.4×
    else               scale = 1.4 - ((t - 0.35) / 0.65) * 0.6  // shrink out 1.4→0.8×

    // Fade out in the last 35%
    const alpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1

    const color    = dmgColor(p.value, p.blocked)
    const fontSize = Math.round(22 * scale)
    const label    = p.blocked ? `${p.value}` : `-${p.value}`

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font         = `bold ${fontSize}px "Press Start 2P", monospace`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'

    // Thick black outline for readability against any background
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.lineWidth   = fontSize * 0.35
    ctx.lineJoin    = 'round'
    ctx.strokeText(label, x, y)

    ctx.fillStyle = color
    ctx.fillText(label, x, y)

    // Tiny "★" burst on first pop
    if (t < 0.15) {
      const burstAlpha = (1 - t / 0.15) * 0.7
      ctx.globalAlpha = alpha * burstAlpha
      ctx.font      = `bold ${Math.round(14 * scale)}px "Press Start 2P", monospace`
      ctx.fillStyle = color
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2
        const r = fontSize * 0.9
        ctx.fillText('★', x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.6)
      }
    }

    ctx.restore()
  }
}

// ── Utils ──────────────────────────────────────────────────────────────────

function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string, size: number
) {
  ctx.save()
  ctx.font         = `bold ${size}px "Press Start 2P", monospace`
  ctx.fillStyle    = color
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y);  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h);  ctx.arcTo(x,     y + h, x,     y + h - r, r)
  ctx.lineTo(x, y + r);      ctx.arcTo(x,     y,     x + r, y,         r)
  ctx.closePath()
}
