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

type OnlinePhase = 'searching' | 'found' | 'calibrating' | 'ready' | 'fighting' | 'gameover' | 'disconnected' | 'queueFull'
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

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const pendingOfferRef = useRef<{ type: string; sdp?: string } | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const [remoteVideoReady, setRemoteVideoReady] = useState(false)

  stateRef.current = gameState

  // ── WebRTC helpers ─────────────────────────────────────────────────────────

  const closePeerConnection = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    pendingCandidatesRef.current = []
    pendingOfferRef.current = null
    setRemoteVideoReady(false)
  }, [])

  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c))
      } catch {
        // skip bad candidate
      }
    }
    pendingCandidatesRef.current = []
  }, [])

  const processRemoteOffer = useCallback(
    async (pc: RTCPeerConnection, offer: { type: string; sdp?: string }) => {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socketClient.sendSignal(answer)
      await drainPendingCandidates(pc)
    },
    [drainPendingCandidates]
  )

  const addTracksAndOffer = useCallback(
    async (pc: RTCPeerConnection, stream: MediaStream) => {
      for (const t of stream.getTracks()) {
        if (!pc.getSenders().some((s) => s.track === t)) {
          pc.addTrack(t, stream)
        }
      }
      if (mySideRef.current === 'left') {
        if (pc.signalingState !== 'stable') return
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socketClient.sendSignal(offer)
      } else if (pendingOfferRef.current) {
        // Right side: an offer arrived before our stream was ready — process it now
        // so the answer SDP includes our outgoing tracks.
        const queued = pendingOfferRef.current
        pendingOfferRef.current = null
        await processRemoteOffer(pc, queued)
      }
    },
    [processRemoteOffer]
  )

  const initPeerConnection = useCallback(() => {
    closePeerConnection()

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    pc.ontrack = (e) => {
      const stream = e.streams[0]
      console.log('[webrtc] ontrack', e.track.kind, 'streams=', e.streams.length, 'muted=', e.track.muted)
      if (!stream || !remoteVideoRef.current) return

      // Re-attach srcObject only if it's a different stream (avoid resetting the video element)
      if (remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream
      }
      setRemoteVideoReady(true)

      e.track.onended = () => console.warn('[webrtc] remote track ended:', e.track.kind)
      e.track.onmute = () => console.warn('[webrtc] remote track muted:', e.track.kind)
      e.track.onunmute = () => console.log('[webrtc] remote track unmuted:', e.track.kind)
      stream.onremovetrack = (ev) => console.warn('[webrtc] remote stream removetrack:', ev.track.kind)
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketClient.sendSignal({ type: 'candidate', candidate: e.candidate.toJSON() })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('[webrtc] iceConnectionState=', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        // Try ICE restart on the offerer side
        if (mySideRef.current === 'left') {
          pc.restartIce?.()
        }
      }
    }
    pc.onconnectionstatechange = () => {
      console.log('[webrtc] connectionState=', pc.connectionState)
    }
    pc.onsignalingstatechange = () => {
      console.log('[webrtc] signalingState=', pc.signalingState)
    }

    pcRef.current = pc

    if (localStreamRef.current) {
      addTracksAndOffer(pc, localStreamRef.current)
    }
  }, [closePeerConnection, addTracksAndOffer])

  const onStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream
    if (pcRef.current) {
      addTracksAndOffer(pcRef.current, stream)
    }
  }, [addTracksAndOffer])

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
      initPeerConnection()
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

    // Server starts round (round 1: after both players ready; subsequent: after round-end delay)
    const offRoundStart = socketClient.onRoundStart(({ round }) => {
      setOnlinePhase('fighting')
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

    const offSignal = socketClient.onSignal(async (raw) => {
      const sig = raw as { type: string; sdp?: string; candidate?: RTCIceCandidateInit }
      const pc = pcRef.current
      if (!pc) return
      try {
        if (sig.type === 'offer') {
          // Right side defers answering until local tracks are added, otherwise
          // our answer SDP would be recv-only and the opponent would never see us.
          const haveLocalTracks = pc.getSenders().some((s) => s.track)
          if (mySideRef.current === 'right' && !haveLocalTracks) {
            pendingOfferRef.current = sig
            return
          }
          await processRemoteOffer(pc, sig)
        } else if (sig.type === 'answer') {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: sig.sdp })
          )
          await drainPendingCandidates(pc)
        } else if (sig.type === 'candidate' && sig.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(sig.candidate))
          } else {
            pendingCandidatesRef.current.push(sig.candidate)
          }
        }
      } catch (err) {
        console.warn('[webrtc] signal error', err)
      }
    })

    return () => {
      cancelled = true
      offFound(); offPunch(); offRound(); offRoundStart()
      offMatch(); offRating(); offLeft(); offConnect(); offDisconnect()
      offReconnecting(); offReconnectFailed()
      offQueueFull(); offRematchWaiting(); offRematchDeclined()
      offSignal()
      if (matchTimerRef.current) clearInterval(matchTimerRef.current)
      closePeerConnection()
      socketClient.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [initPeerConnection, closePeerConnection, processRemoteOffer, drainPendingCandidates])

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
    setOnlinePhase('ready')
    socketClient.sendReady()
    track('match_start')
  }, [])

  const handleRematch = useCallback(() => {
    closePeerConnection()
    detectorRef.current.reset()
    setGameState(createGame())
    setMatchResult(null)
    setMatchInfo(null)
    setRatingUpdate(null)
    setRematchStatus('idle')
    setOnlinePhase('searching')
    socketClient.findMatch()
  }, [closePeerConnection])

  const handleRequestRematch = useCallback(() => {
    socketClient.sendRematch()
  }, [])

  // ── Render states ──────────────────────────────────────────────────────────

  if (onlinePhase === 'queueFull') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808]">
        <div className="flex flex-col items-center gap-4">
          <p className="font-pixel text-[10px] text-[#FF1744]">SERVER FULL</p>
          <p className="font-pixel text-[8px] text-white/40">TRY AGAIN IN A FEW MINUTES</p>
          <a href="/" className="font-pixel text-[8px] text-white/30 mt-4 hover:text-white/50">
            BACK
          </a>
        </div>
      </div>
    )
  }

  const isFighting = onlinePhase === 'fighting'

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
        {/* Player webcam — always mounted so MediaPipe loads during matchmaking */}
        <div className={`absolute top-0 left-0 bottom-0 ${isFighting ? 'w-1/2' : 'w-full'}`}>
          <WebcamFeed
            onLandmarks={onLandmarks}
            onStatusChange={setWebcamStatus}
            onStream={onStream}
            showOverlay={isFighting || onlinePhase === 'calibrating' || onlinePhase === 'searching'}
            className="w-full h-full"
          />
        </div>

        {/* Opponent webcam — right half, shown during fighting via WebRTC */}
        <div className={`absolute top-0 right-0 bottom-0 w-1/2 bg-black transition-opacity ${isFighting ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!remoteVideoReady && isFighting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-pixel text-[7px] text-white/30 blink">CONNECTING VIDEO...</p>
            </div>
          )}
        </div>

        {isFighting && (
          <div className="absolute inset-0 pointer-events-none">
            <GameCanvas
              gameState={gameState}
              webcamMode
              opponentHasVideo={remoteVideoReady}
              className="w-full h-full"
            />
          </div>
        )}

        {onlinePhase === 'calibrating' && webcamStatus === 'ready' && (
          <CalibrationOverlay
            poseDetected={poseDetected}
            onComplete={onCalibrationComplete}
          />
        )}

        {onlinePhase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <p className="font-pixel text-[10px] text-[#00E676] blink">WAITING FOR OPPONENT...</p>
          </div>
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

        {/* Overlays for pre-match phases — rendered on top of the live webcam */}
        {onlinePhase === 'searching' && (
          <div className="absolute inset-0 flex flex-col items-center justify-between bg-black/50 py-6 px-4">
            {/* Top: matchmaking status */}
            <div className="flex flex-col items-center gap-3">
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
            </div>

            {/* Bottom: pose status + cancel */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="font-pixel text-[8px] px-3 py-1"
                style={{
                  color: poseDetected ? '#00E676' : '#FFD700',
                  border: `1px solid ${poseDetected ? '#00E676' : '#FFD70060'}`,
                }}
              >
                {poseDetected ? 'POSE READY ✓' : 'GET IN POSITION...'}
              </div>
              <a href="/" className="font-pixel text-[7px] text-white/30 hover:text-white/50">
                CANCEL
              </a>
            </div>
          </div>
        )}

        {onlinePhase === 'found' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
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
          </div>
        )}
      </div>
    </div>
  )
}
