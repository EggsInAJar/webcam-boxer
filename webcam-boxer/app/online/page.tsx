'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import HUD from '@/components/HUD'
import CalibrationOverlay from '@/components/CalibrationOverlay'
import PostMatchCard from '@/components/PostMatchCard'
import ConnectionStatus from '@/components/ConnectionStatus'
import { PunchDetector } from '@/lib/punchDetector'
import {
  createGame,
  applyPunch,
  clearBlock,
  tick,
  startFighting,
} from '@/lib/gameEngine'
import { socketClient } from '@/lib/socketClient'
import { getIdentity, refreshRating } from '@/lib/identity'
import { track } from '@vercel/analytics'
import type { GameState } from '@/lib/types'
import type { NormalizedLandmark } from '@/lib/mediapipe'
import type { WebcamStatus } from '@/components/WebcamFeed'
import type { MatchResultPayload, MatchFoundPayload, RatingUpdatePayload } from '@/lib/socketClient'

const WebcamFeed = dynamic(() => import('@/components/WebcamFeed'), { ssr: false })
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false })

type OnlinePhase = 'searching' | 'found' | 'calibrating' | 'fighting' | 'gameover' | 'disconnected' | 'queueFull'
type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export default function OnlinePage() {
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('searching')
  const [gameState, setGameState] = useState<GameState>(createGame)
  const [poseDetected, setPoseDetected] = useState(false)
  const [webcamStatus, setWebcamStatus] = useState<WebcamStatus>('requesting')
  const [matchCountdown, setMatchCountdown] = useState(3)
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting')
  const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null)
  const [matchInfo, setMatchInfo] = useState<MatchFoundPayload | null>(null)
  const [myRating, setMyRating] = useState(1200)
  const [ratingUpdate, setRatingUpdate] = useState<RatingUpdatePayload | null>(null)
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'waiting' | 'declined'>('idle')

  const roomRef = useRef<string>('')
  const mySideRef = useRef<'left' | 'right'>('left')
  const detectorRef = useRef(new PunchDetector())
  const stateRef = useRef<GameState>(gameState)
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)
  const blockClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const matchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  stateRef.current = gameState

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      // Fetch identity to pass auth credentials and pre-load rating
      const identity = await getIdentity().catch(() => null)
      if (cancelled) return

      if (identity) setMyRating(identity.rating)

      socketClient.connect(
        identity ? { guestId: identity.guestId, token: identity.token } : undefined
      )
      socketClient.findMatch()
    }

    init()

    const offFound = socketClient.onMatchFound((payload) => {
      roomRef.current = payload.room
      mySideRef.current = payload.side
      setMatchInfo(payload)
      setMatchResult(null)
      setRatingUpdate(null)
      setRematchStatus('idle')
      detectorRef.current.reset()
      setGameState(createGame())
      setOnlinePhase('found')

      let c = 3
      setMatchCountdown(c)
      if (matchTimerRef.current) clearInterval(matchTimerRef.current)
      matchTimerRef.current = setInterval(() => {
        c--
        setMatchCountdown(c)
        if (c <= 0) {
          clearInterval(matchTimerRef.current!)
          matchTimerRef.current = null
          setOnlinePhase('calibrating')
        }
      }, 1000)
    })

    // Opponent punch — optimistic visual update only
    const offPunch = socketClient.onOpponentPunch((punch) => {
      setGameState((s) => applyPunch(s, punch, 'player'))
    })

    // Server declares round end — snap HP to server values
    const offRound = socketClient.onRoundResult((result) => {
      setGameState((s) => {
        const mySide = mySideRef.current
        const myHp    = mySide === 'left' ? result.hpLeft  : result.hpRight
        const oppHp   = mySide === 'left' ? result.hpRight : result.hpLeft
        const myWins  = mySide === 'left' ? result.roundsWonLeft  : result.roundsWonRight
        const oppWins = mySide === 'left' ? result.roundsWonRight : result.roundsWonLeft
        return {
          ...s,
          player:   { ...s.player,   hp: myHp,  roundsWon: myWins },
          opponent: { ...s.opponent, hp: oppHp, roundsWon: oppWins },
          phase: 'roundEnd',
        }
      })
    })

    // Server starts next round
    const offRoundStart = socketClient.onRoundStart(({ round }) => {
      setGameState((s) => ({
        ...startFighting(s),
        round,
        player:   { ...s.player,   hp: 100, blocking: false },
        opponent: { ...s.opponent, hp: 100, blocking: false },
      }))
    })

    // Server declares match end — authoritative result
    const offMatch = socketClient.onMatchResult((result) => {
      setMatchResult(result)
      setOnlinePhase('gameover')
      cancelAnimationFrame(rafRef.current)
      track('match_end', { reason: result.reason, won: result.winnerSide === mySideRef.current })
    })

    // Server sends per-player ELO update after match is persisted
    const offRating = socketClient.onRatingUpdate((update) => {
      setRatingUpdate(update)
      setMyRating(update.after)
      refreshRating(update.after)
    })

    const offLeft = socketClient.onOpponentLeft(() => {
      // Server will emit matchResult after grace period; this is just a UI hint
    })

    const offConnect = socketClient.onConnect(() => setConnStatus('live'))
    const offDisconnect = socketClient.onDisconnect(() => setConnStatus('offline'))
    const offReconnecting = socketClient.onReconnecting(() => setConnStatus('reconnecting'))
    const offReconnectFailed = socketClient.onReconnectFailed(() => setConnStatus('offline'))

    const offQueueFull = socketClient.onQueueFull(() => setOnlinePhase('queueFull'))
    const offRematchWaiting = socketClient.onRematchWaiting(() => setRematchStatus('waiting'))
    const offRematchDeclined = socketClient.onRematchDeclined(() => setRematchStatus('declined'))

    return () => {
      cancelled = true
      offFound(); offPunch(); offRound(); offRoundStart()
      offMatch(); offRating(); offLeft(); offConnect(); offDisconnect()
      offReconnecting(); offReconnectFailed()
      offQueueFull(); offRematchWaiting(); offRematchDeclined()
      if (matchTimerRef.current) clearInterval(matchTimerRef.current)
      socketClient.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ── Visual game timer (cosmetic — server is authoritative for round end) ───
  useEffect(() => {
    if (onlinePhase !== 'fighting') return

    function loop(ts: number) {
      const dt = lastTickRef.current ? Math.min(ts - lastTickRef.current, 50) : 16
      lastTickRef.current = ts
      setGameState((s) => tick(s, dt))
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [onlinePhase])

  const onLandmarks = useCallback(
    (landmarks: NormalizedLandmark[], _ts: number) => {
      setPoseDetected(true)
      if (stateRef.current.phase !== 'fighting') return

      const event = detectorRef.current.pushFrame(landmarks)
      if (!event) return

      if (event.type === 'block') {
        setGameState((s) => ({ ...s, player: { ...s.player, blocking: true } }))
        if (blockClearRef.current) clearTimeout(blockClearRef.current)
        blockClearRef.current = setTimeout(() => {
          setGameState((s) => clearBlock(s, 'player'))
        }, 600)
        return
      }

      // Optimistic visual update
      setGameState((s) => applyPunch(s, event.type, 'opponent'))
      // Send to server (server is the authority)
      socketClient.sendPunch(roomRef.current, event.type)
    },
    []
  )

  const onCalibrationComplete = useCallback(() => {
    setOnlinePhase('fighting')
    setGameState((s) => startFighting(s))
    track('match_start')
  }, [])

  const handleRematch = useCallback(() => {
    detectorRef.current.reset()
    setGameState(createGame())
    setMatchResult(null)
    setMatchInfo(null)
    setRatingUpdate(null)
    setRematchStatus('idle')
    setOnlinePhase('searching')
    socketClient.findMatch()
  }, [])

  const handleRequestRematch = useCallback(() => {
    socketClient.sendRematch()
  }, [])

  // ── Render states ──────────────────────────────────────────────────────────

  if (onlinePhase === 'queueFull') {
    return (
      <StatusScreen>
        <div className="flex flex-col items-center gap-4">
          <p className="font-pixel text-[10px] text-[#FF1744]">SERVER FULL</p>
          <p className="font-pixel text-[8px] text-white/40">TRY AGAIN IN A FEW MINUTES</p>
          <a href="/" className="font-pixel text-[8px] text-white/30 mt-4 hover:text-white/50">
            BACK
          </a>
        </div>
      </StatusScreen>
    )
  }

  if (onlinePhase === 'searching') {
    return (
      <StatusScreen>
        <div className="flex flex-col items-center gap-6">
          <div className="font-pixel text-[10px] text-gold blink">FINDING OPPONENT...</div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 bg-gold"
                style={{ animation: `blink 1.2s step-end ${i * 0.4}s infinite` }}
              />
            ))}
          </div>
          <a href="/" className="font-pixel text-[8px] text-white/30 mt-4 hover:text-white/50">
            CANCEL
          </a>
        </div>
      </StatusScreen>
    )
  }

  if (onlinePhase === 'found') {
    return (
      <StatusScreen>
        <div className="flex flex-col items-center gap-4">
          <p className="font-pixel text-[10px] text-[#00E676]">OPPONENT FOUND!</p>
          {matchInfo?.opponentUsername && (
            <p className="font-pixel text-[8px] text-white/50">{matchInfo.opponentUsername}</p>
          )}
          {matchInfo?.opponentRating !== undefined && (
            <p className="font-pixel text-[8px]" style={{ color: '#FFD700' }}>
              ★ {matchInfo.opponentRating}
            </p>
          )}
          <div
            className="font-pixel text-6xl text-gold"
            style={{ textShadow: '0 0 30px rgba(255,215,0,0.9)' }}
          >
            {matchCountdown}
          </div>
          <p className="font-pixel text-[8px] text-white/40">GET READY...</p>
        </div>
      </StatusScreen>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808] px-4 py-6 gap-4">
      <div className="w-full max-w-[800px] flex items-center justify-between">
        <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/60">
          ← BACK
        </a>
        <div className="flex items-center gap-4">
          <ConnectionStatus status={connStatus} />
          <span className="font-pixel text-[8px] text-[#00E676]">ONLINE 1V1</span>
        </div>
      </div>

      <HUD state={gameState} />

      <div className="relative w-full max-w-[800px]" style={{ aspectRatio: '2/1' }}>
        {/* Webcam occupies left half during fight, full width during calibration */}
        <div className={`absolute top-0 left-0 bottom-0 ${onlinePhase === 'fighting' ? 'w-1/2' : 'w-full'}`}>
          <WebcamFeed
            onLandmarks={onLandmarks}
            onStatusChange={setWebcamStatus}
            showOverlay={onlinePhase !== 'fighting'}
            className="w-full h-full"
          />
        </div>

        {onlinePhase === 'fighting' && (
          <div className="absolute inset-0">
            <GameCanvas gameState={gameState} webcamMode className="w-full h-full" />
          </div>
        )}

        {onlinePhase === 'calibrating' && webcamStatus === 'ready' && (
          <CalibrationOverlay
            poseDetected={poseDetected}
            onComplete={onCalibrationComplete}
          />
        )}

        {onlinePhase === 'gameover' && matchResult && (
          <PostMatchCard
            result={matchResult}
            mySide={mySideRef.current}
            myRating={myRating}
            ratingDelta={ratingUpdate?.delta}
            onFindNewOpponent={handleRematch}
            onRematch={handleRequestRematch}
            rematchStatus={rematchStatus}
          />
        )}
      </div>
    </div>
  )
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808]">
      {children}
    </div>
  )
}
