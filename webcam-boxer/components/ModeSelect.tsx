'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Difficulty } from '@/lib/types'

export default function ModeSelect() {
  const router = useRouter()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
      {/* Solo vs AI */}
      <div className="panel p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🥊</span>
          <div>
            <h2 className="font-pixel text-sm text-gold">SOLO VS AI</h2>
            <p className="font-pixel text-[8px] text-white/40 mt-1">FIGHT A CPU OPPONENT</p>
          </div>
        </div>

        <ul className="font-pixel text-[8px] text-white/50 space-y-2">
          <li>▶ PICK YOUR DIFFICULTY</li>
          <li>▶ BEST OF 3 ROUNDS</li>
          <li>▶ FIGHT ANYTIME</li>
        </ul>

        {/* Difficulty selector */}
        <div>
          <p className="font-pixel text-[8px] text-white/30 mb-3 tracking-widest">DIFFICULTY</p>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="flex-1 font-pixel text-[8px] py-2 border-2 transition-none"
                style={{
                  borderColor: difficulty === d ? '#FFD700' : '#333',
                  color: difficulty === d ? '#FFD700' : '#555',
                  background: difficulty === d ? 'rgba(255,215,0,0.07)' : 'transparent',
                }}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn-arcade w-full text-center mt-auto"
          onClick={() => router.push(`/solo?difficulty=${difficulty}`)}
        >
          PLAY NOW
        </button>
      </div>

      {/* Online 1v1 */}
      <div className="panel p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🌐</span>
          <div>
            <h2 className="font-pixel text-sm text-gold">FIGHT A STRANGER</h2>
            <p className="font-pixel text-[8px] text-white/40 mt-1">RANDOM ONLINE MATCHMAKING</p>
          </div>
        </div>

        <ul className="font-pixel text-[8px] text-white/50 space-y-2">
          <li>▶ MATCHED WITH A REAL OPPONENT</li>
          <li>▶ LIVE WEBCAM DETECTION</li>
          <li>▶ BEST OF 3 ROUNDS</li>
        </ul>

        {/* Spacer to align buttons */}
        <div className="h-[52px]" />

        <button
          className="btn-arcade w-full text-center mt-auto"
          onClick={() => router.push('/online')}
        >
          FIND MATCH
        </button>
      </div>
    </div>
  )
}
