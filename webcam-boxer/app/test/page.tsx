'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { PunchDetector } from '@/lib/punchDetector'
import type { NormalizedLandmark } from '@/lib/mediapipe'

const WebcamFeed = dynamic(() => import('@/components/WebcamFeed'), { ssr: false })

const detector = new PunchDetector()

export default function TestPage() {
  const [lastPunch, setLastPunch] = useState<string>('—')
  const [punchLog, setPunchLog] = useState<string[]>([])
  const [lDeltas, setLDeltas] = useState({ dx: 0, dy: 0, dz: 0 })
  const [rDeltas, setRDeltas] = useState({ dx: 0, dy: 0, dz: 0 })
  const [frameCount, setFrameCount] = useState(0)

  const onLandmarks = useCallback((lms: NormalizedLandmark[], ts: number) => {
    setFrameCount((c) => c + 1)
    const event = detector.pushFrame(lms)
    if (event) {
      const label = `${event.type.toUpperCase()} (${event.hand})`
      setLastPunch(label)
      setPunchLog((log) => [label, ...log.slice(0, 9)])
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#080808] p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-pixel text-sm text-gold">DETECTION TEST</h1>
        <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/60">← BACK</a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Webcam */}
        <div className="panel overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <WebcamFeed
            onLandmarks={onLandmarks}
            showOverlay
            className="w-full h-full"
          />
        </div>

        {/* Debug panel */}
        <div className="flex flex-col gap-4">
          {/* Last punch */}
          <div className="panel p-4">
            <p className="font-pixel text-[8px] text-white/30 mb-2">LAST DETECTED</p>
            <p className="font-pixel text-xl text-gold">{lastPunch}</p>
          </div>

          {/* Frame rate */}
          <div className="panel p-4">
            <p className="font-pixel text-[8px] text-white/30 mb-2">FRAMES PROCESSED</p>
            <p className="font-pixel text-sm text-white">{frameCount}</p>
          </div>

          {/* Punch log */}
          <div className="panel p-4 flex-1">
            <p className="font-pixel text-[8px] text-white/30 mb-3">PUNCH LOG</p>
            <div className="flex flex-col gap-1">
              {punchLog.length === 0 ? (
                <p className="font-pixel text-[8px] text-white/20">THROW A PUNCH...</p>
              ) : (
                punchLog.map((p, i) => (
                  <p
                    key={i}
                    className="font-pixel text-[8px]"
                    style={{ color: i === 0 ? '#FFD700' : `rgba(245,245,245,${0.6 - i * 0.05})` }}
                  >
                    {i === 0 ? '▶ ' : '  '}{p}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="panel p-4">
        <p className="font-pixel text-[8px] text-white/30 mb-3">HOW TO TEST</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['JAB', 'EXTEND LEFT FIST FORWARD'],
            ['CROSS', 'EXTEND RIGHT FIST FORWARD'],
            ['HOOK', 'SWING EITHER ARM SIDEWAYS'],
            ['UPPERCUT', 'PUNCH UPWARD WITH EITHER ARM'],
            ['BLOCK', 'RAISE BOTH ARMS ABOVE SHOULDERS'],
          ].map(([move, hint]) => (
            <div key={move} className="text-center">
              <p className="font-pixel text-[8px] text-gold mb-1">{move}</p>
              <p className="font-pixel text-[7px] text-white/30 leading-loose">{hint}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
