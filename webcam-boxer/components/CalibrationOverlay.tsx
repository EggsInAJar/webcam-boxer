'use client'

import { useEffect, useState } from 'react'

type Props = {
  poseDetected: boolean
  onComplete: () => void
}

export default function CalibrationOverlay({ poseDetected, onComplete }: Props) {
  const [countdown, setCountdown] = useState(3)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!poseDetected || started) return
    setStarted(true)
  }, [poseDetected, started])

  useEffect(() => {
    if (!started) return
    if (countdown <= 0) {
      onComplete()
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [started, countdown, onComplete])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
      {!poseDetected ? (
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="text-4xl">🥊</div>
          <p className="font-pixel text-sm text-gold glow-gold">GET IN POSITION</p>
          <p className="font-pixel text-[8px] text-white/50 leading-loose max-w-[260px]">
            STEP BACK UNTIL YOUR SHOULDERS AND ARMS ARE FULLY VISIBLE IN THE CAMERA.
          </p>
          <div className="flex gap-3 mt-2">
            <PoseIndicator label="LEFT ARM" detected={false} />
            <PoseIndicator label="SHOULDERS" detected={false} />
            <PoseIndicator label="RIGHT ARM" detected={false} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="font-pixel text-[10px] text-[#00E676]">POSE LOCKED ✓</p>
          <div
            className="font-pixel text-7xl text-gold"
            style={{ textShadow: '0 0 30px rgba(255,215,0,0.9)' }}
          >
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <p className="font-pixel text-[8px] text-white/40">GET READY TO FIGHT</p>
        </div>
      )}
    </div>
  )
}

function PoseIndicator({ label, detected }: { label: string; detected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-3 h-3 border-2"
        style={{
          background: detected ? '#00E676' : 'transparent',
          borderColor: detected ? '#00E676' : '#444',
        }}
      />
      <span className="font-pixel text-[6px] text-white/30">{label}</span>
    </div>
  )
}
