'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import HUD from '@/components/HUD'
import CalibrationOverlay from '@/components/CalibrationOverlay'
import { PunchDetector } from '@/lib/punchDetector'
import { AIOpponent } from '@/lib/aiOpponent'
import {
  createGame,
  applyPunch,
  clearBlock,
  tick,
  startCountdown,
  startFighting,
  getWinner,
  DAMAGE,
} from '@/lib/gameEngine'
import type { GameState, Difficulty } from '@/lib/types'
import type { NormalizedLandmark } from '@/lib/mediapipe'
import type { WebcamStatus } from '@/components/WebcamFeed'

const WebcamFeed = dynamic(() => import('@/components/WebcamFeed'), { ssr: false })
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false })

export default function SoloPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SoloGame />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808]">
      <p className="font-pixel text-[10px] blink" style={{ color: '#FFD700' }}>LOADING...</p>
    </div>
  )
}

function SoloGame() {
  const params = useSearchParams()
  const raw = params.get('difficulty')
  const difficulty: Difficulty = raw === 'easy' || raw === 'medium' || raw === 'hard' ? raw : 'medium'

  const [gameState, setGameState] = useState<GameState>(createGame)
  const [poseDetected, setPoseDetected] = useState(false)
  const [calibrated, setCalibrated] = useState(false)
  const [webcamStatus, setWebcamStatus] = useState<WebcamStatus>('requesting')

  const detectorRef = useRef(new PunchDetector())
  const aiRef = useRef(new AIOpponent(difficulty))
  const stateRef = useRef<GameState>(gameState)
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)
  const blockClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync so game loop and callbacks read fresh state
  stateRef.current = gameState

  // ── Landmarks → player punches ─────────────────────────────────────────────
  const onLandmarks = useCallback(
    (landmarks: NormalizedLandmark[], _ts: number) => {
      setPoseDetected(true)
      if (stateRef.current.phase !== 'fighting') return

      const event = detectorRef.current.pushFrame(landmarks)
      if (!event) return

      if (event.type === 'block') {
        setGameState((s) => ({ ...s, player: { ...s.player, blocking: true } }))
        if (blockClearRef.current) clearTimeout(blockClearRef.current)
        blockClearRef.current = setTimeout(
          () => setGameState((s) => clearBlock(s, 'player')),
          600
        )
        return
      }

      // Notify AI before state update so it reacts with correct damage value.
      // We read current blocking state from stateRef — it's always fresh.
      const rawDmg = DAMAGE[event.type as keyof typeof DAMAGE] ?? 0
      const blocked = stateRef.current.opponent.blocking
      aiRef.current.onPlayerPunch(blocked ? Math.round(rawDmg * 0.5) : rawDmg)

      setGameState((s) => applyPunch(s, event.type, 'opponent'))
    },
    [] // stable: uses stateRef (ref, not state) and aiRef
  )

  // ── Game loop: timer + AI ──────────────────────────────────────────────────
  useEffect(() => {
    if (!calibrated) return

    function loop(ts: number) {
      // Cap dt at 50ms to prevent huge jumps if the tab loses focus
      const dt = lastTickRef.current ? Math.min(ts - lastTickRef.current, 50) : 16
      lastTickRef.current = ts

      // Tick AI outside the state updater — AI has its own internal state
      // and React may call updaters more than once in Strict Mode.
      const aiEvent = aiRef.current.tick(dt, stateRef.current)

      setGameState((s) => {
        // Advance round timer
        let next = tick(s, dt)

        // Apply AI action this frame
        if (aiEvent) {
          if (aiEvent.type === 'blockStart') {
            next = { ...next, opponent: { ...next.opponent, blocking: true } }
          } else if (aiEvent.type === 'blockEnd') {
            next = clearBlock(next, 'opponent')
          } else if (aiEvent.type === 'punch') {
            next = applyPunch(next, aiEvent.punch, 'player')
          }
        }

        return next
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [calibrated])

  // ── Calibration done → 3-second countdown → fight ─────────────────────────
  const onCalibrationComplete = useCallback(() => {
    setCalibrated(true)
    setGameState((s) => ({ ...startCountdown(s), timer: 3 }))

    let count = 3
    const iv = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(iv)
        setGameState((s) => startFighting(s))
      } else {
        setGameState((s) => ({ ...s, timer: count }))
      }
    }, 1000)
  }, [])

  // ── Between rounds: reset AI and start next round ─────────────────────────
  const startNextRound = useCallback(() => {
    aiRef.current.reset(difficulty)
    setGameState((s) => startFighting(s))
  }, [difficulty])

  // ── Full restart ──────────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    aiRef.current.reset(difficulty)
    detectorRef.current.reset()
    lastTickRef.current = 0
    setGameState(createGame())
    setCalibrated(false)
    setPoseDetected(false)
  }, [difficulty])

  const winner = gameState.phase === 'gameOver' ? getWinner(gameState) : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808] px-4 py-6 gap-4">
      {/* Nav */}
      <div className="w-full max-w-[800px] flex items-center justify-between">
        <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/60">
          ← BACK
        </a>
        <span className="font-pixel text-[8px] text-white/30">{difficulty.toUpperCase()} MODE</span>
      </div>

      {/* HUD */}
      <HUD state={gameState} />

      {/* Game area */}
      <div className="relative w-full max-w-[800px]" style={{ aspectRatio: '2/1' }}>
        {/* Webcam occupies left half during fight, full width during calibration */}
        <div className={`absolute top-0 left-0 bottom-0 ${calibrated ? 'w-1/2' : 'w-full'}`}>
          <WebcamFeed
            onLandmarks={onLandmarks}
            onStatusChange={setWebcamStatus}
            showOverlay={!calibrated}
            className="w-full h-full"
          />
        </div>

        {/* Game canvas: transparent left half (webcam), dark right half (opponent) */}
        {calibrated && (
          <div className="absolute inset-0">
            <GameCanvas
              gameState={gameState}
              webcamMode
              className="w-full h-full"
            />
          </div>
        )}

        {/* Calibration overlay — shown before game starts */}
        {!calibrated && webcamStatus === 'ready' && (
          <CalibrationOverlay
            poseDetected={poseDetected}
            onComplete={onCalibrationComplete}
          />
        )}

        {/* Game over buttons */}
        {gameState.phase === 'gameOver' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 gap-4 z-20">
            <button className="btn-arcade" onClick={handleRestart}>
              PLAY AGAIN
            </button>
            <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/50">
              MAIN MENU
            </a>
          </div>
        )}
      </div>

      {/* Auto-advance after round end */}
      <RoundEndHandler state={gameState} onNext={startNextRound} />

      {/* Move cheatsheet */}
      {calibrated && gameState.phase === 'fighting' && (
        <div className="flex gap-6 flex-wrap justify-center">
          {[
            ['JAB', 'LEFT PUNCH FWD'],
            ['CROSS', 'RIGHT PUNCH FWD'],
            ['HOOK', 'SIDE SWING'],
            ['UPPERCUT', 'PUNCH UP'],
            ['BLOCK', 'BOTH ARMS HIGH'],
          ].map(([move, hint]) => (
            <div key={move} className="text-center">
              <p className="font-pixel text-[7px]" style={{ color: '#FFD700' }}>{move}</p>
              <p className="font-pixel text-[6px] text-white/25">{hint}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoundEndHandler({
  state,
  onNext,
}: {
  state: GameState
  onNext: () => void
}) {
  useEffect(() => {
    if (state.phase !== 'roundEnd') return
    const t = setTimeout(onNext, 3000)
    return () => clearTimeout(t)
    // Re-run when round changes (not just phase) in case of fast KOs
  }, [state.phase, state.round, onNext])
  return null
}
