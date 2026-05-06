'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getPoseLandmarker, LM } from '@/lib/mediapipe'
import type { NormalizedLandmark } from '@/lib/mediapipe'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

const CONNECTIONS: [number, number][] = [
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
]

export type WebcamStatus = 'requesting' | 'loading' | 'ready' | 'denied' | 'error' | 'ai-error'

type Props = {
  onLandmarks?: (landmarks: NormalizedLandmark[], timestamp: number) => void
  onStatusChange?: (status: WebcamStatus) => void
  onStream?: (stream: MediaStream) => void
  showOverlay?: boolean
  className?: string
}

export default function WebcamFeed({
  onLandmarks,
  onStatusChange,
  onStream,
  showOverlay = true,
  className = '',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const rafRef = useRef<number>(0)
  const activeRef = useRef(true)
  const [status, setStatus] = useState<WebcamStatus>('requesting')

  const updateStatus = useCallback(
    (s: WebcamStatus) => {
      setStatus(s)
      onStatusChange?.(s)
    },
    [onStatusChange]
  )

  useEffect(() => {
    activeRef.current = true
    let stream: MediaStream | null = null

    async function init() {
      // Step 1: camera access
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
      } catch (err: unknown) {
        const name = (err as Error)?.name
        updateStatus(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error')
        return
      }

      if (!activeRef.current || !videoRef.current) return
      videoRef.current.srcObject = stream
      onStream?.(stream)

      // Step 2: load pose AI
      updateStatus('loading')
      try {
        const lm = await getPoseLandmarker()
        if (!activeRef.current) return
        landmarkerRef.current = lm
        updateStatus('ready')
      } catch {
        updateStatus('ai-error')
      }
    }

    init()

    return () => {
      activeRef.current = false
      cancelAnimationFrame(rafRef.current)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [updateStatus])

  useEffect(() => {
    if (status !== 'ready') return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')!
    let lastTs = -1

    function loop() {
      if (!activeRef.current || !landmarkerRef.current) return
      const now = performance.now()
      if (now !== lastTs) {
        lastTs = now
        const result = landmarkerRef.current.detectForVideo(video!, now)

        ctx.clearRect(0, 0, canvas!.width, canvas!.height)

        if (result.landmarks.length > 0) {
          const lms = result.landmarks[0]
          const w = canvas!.width
          const h = canvas!.height

          if (showOverlay) {
            ctx.strokeStyle = 'rgba(255,215,0,0.7)'
            ctx.lineWidth = 3
            for (const [a, b] of CONNECTIONS) {
              const la = lms[a]
              const lb = lms[b]
              if (!la || !lb) continue
              ctx.beginPath()
              ctx.moveTo((1 - la.x) * w, la.y * h)
              ctx.lineTo((1 - lb.x) * w, lb.y * h)
              ctx.stroke()
            }

            ctx.fillStyle = '#FFD700'
            for (const idx of Object.values(LM)) {
              const l = lms[idx]
              if (!l) continue
              ctx.beginPath()
              ctx.arc((1 - l.x) * w, l.y * h, 6, 0, Math.PI * 2)
              ctx.fill()
            }
          }

          onLandmarks?.(lms, now)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    function onLoaded() {
      canvas!.width = video!.videoWidth || 640
      canvas!.height = video!.videoHeight || 480
      loop()
    }

    if (video.readyState >= 2) {
      onLoaded()
    } else {
      video.addEventListener('loadeddata', onLoaded, { once: true })
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [status, showOverlay, onLandmarks])

  if (status === 'denied' || status === 'error' || status === 'ai-error') {
    return <CameraBlocked status={status} />
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {status === 'requesting' && (
        <Overlay>
          <p className="text-gold text-xs blink">REQUESTING CAMERA...</p>
        </Overlay>
      )}
      {status === 'loading' && (
        <Overlay>
          <p className="text-gold text-xs blink">LOADING POSE AI...</p>
          <p className="text-white/40 text-[8px] mt-3">FIRST LOAD TAKES ~5S</p>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
      {children}
    </div>
  )
}

function CameraBlocked({ status }: { status: 'denied' | 'error' | 'ai-error' }) {
  const title =
    status === 'denied' ? 'CAMERA BLOCKED' :
    status === 'ai-error' ? 'POSE AI FAILED' :
    'CAMERA ERROR'

  const message =
    status === 'denied'
      ? 'THIS GAME NEEDS YOUR WEBCAM. CLICK THE CAMERA ICON IN YOUR ADDRESS BAR AND ALLOW ACCESS.'
      : status === 'ai-error'
      ? 'CAMERA IS ON BUT THE POSE DETECTION MODEL FAILED TO LOAD. CHECK YOUR CONNECTION AND TRY AGAIN.'
      : 'COULD NOT ACCESS YOUR CAMERA. ANOTHER APP MAY BE USING IT EXCLUSIVELY.'

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 text-center min-h-[300px]">
      <div className="text-red text-2xl">✖</div>
      <p className="text-[#FF1744] text-xs">{title}</p>
      <p className="text-white/60 text-[8px] leading-loose max-w-xs">{message}</p>
      <button className="btn-arcade btn-arcade-sm" onClick={() => window.location.reload()}>
        TRY AGAIN
      </button>
    </div>
  )
}
