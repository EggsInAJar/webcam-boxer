'use client'

import { useState, useCallback } from 'react'
import ModeSelect from '@/components/ModeSelect'
import RatingBadge from '@/components/RatingBadge'
import UsernamePrompt from '@/components/UsernamePrompt'
import { getIdentity } from '@/lib/identity'
import type { Identity } from '@/lib/identity'

export default function Home() {
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false)
  const [identity, setIdentity] = useState<Identity | null>(null)

  const handleEditUsername = useCallback(async () => {
    const id = await getIdentity().catch(() => null)
    setIdentity(id)
    setShowUsernamePrompt(true)
  }, [])

  const handleSaveUsername = useCallback((username: string) => {
    setIdentity((prev) => prev ? { ...prev, username } : prev)
    setShowUsernamePrompt(false)
  }, [])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-12">
      {/* Marquee header */}
      <div className="w-full overflow-hidden marquee-track">
        <div className="inline-flex whitespace-nowrap" style={{ animation: 'marquee 20s linear infinite' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="inline-block px-8">
              ★ WEBCAM BOXER ★ USE YOUR REAL MOVES ★ WEBCAM CONTROLS ★ FIGHT NOW ★
            </span>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="text-center flex flex-col items-center gap-4">
        <h1
          className="font-pixel text-3xl md:text-5xl tracking-widest"
          style={{ color: '#FFD700', textShadow: '0 0 20px rgba(255,215,0,0.7), 0 0 40px rgba(255,215,0,0.3)' }}
        >
          WEBCAM BOXER
        </h1>
        <p className="font-pixel text-[8px] md:text-[10px] tracking-widest" style={{ color: 'rgba(245,245,245,0.4)' }}>
          YOUR WEBCAM IS THE CONTROLLER
        </p>

        {/* Rating badge */}
        <RatingBadge onEditUsername={handleEditUsername} />
      </div>

      {/* Move legend */}
      <div className="flex flex-wrap justify-center gap-6 max-w-xl">
        {MOVES.map(({ emoji, label }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <span className="font-pixel text-[7px]" style={{ color: 'rgba(245,245,245,0.35)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Mode select cards */}
      <ModeSelect />

      {/* Footer */}
      <div className="flex flex-col items-center gap-3">
        <p className="font-pixel text-[7px]" style={{ color: 'rgba(245,245,245,0.2)' }}>
          INSERT COIN TO CONTINUE
          <span className="ml-2 blink">▌</span>
        </p>
        <a
          href="/leaderboard"
          className="font-pixel text-[7px] text-white/20 hover:text-[#FFD700]/60 transition-colors"
        >
          ★ LEADERBOARD
        </a>
      </div>

      {showUsernamePrompt && (
        <UsernamePrompt
          currentUsername={identity?.username ?? null}
          onSave={handleSaveUsername}
          onCancel={() => setShowUsernamePrompt(false)}
        />
      )}

      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </main>
  )
}

const MOVES = [
  { emoji: '👊', label: 'JAB' },
  { emoji: '🤜', label: 'CROSS' },
  { emoji: '🥊', label: 'HOOK' },
  { emoji: '⬆️', label: 'UPPERCUT' },
  { emoji: '🛡️', label: 'BLOCK' },
]
