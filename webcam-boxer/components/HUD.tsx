'use client'

import type { GameState } from '@/lib/types'

type Props = {
  state: GameState
}

export default function HUD({ state }: Props) {
  const { player, opponent, round, timer, phase } = state
  const timerDisplay = Math.ceil(timer).toString().padStart(2, '0')
  const timerDanger = timer <= 10

  return (
    <div className="w-full max-w-[800px] select-none">
      {/* Round indicator + timer row */}
      <div className="flex items-center justify-between px-1 mb-2">
        {/* Player rounds */}
        <RoundDots count={player.roundsWon} color="#00E676" align="left" />

        {/* Center timer */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] text-white/40 font-pixel tracking-widest">ROUND {round}</span>
          <span
            className="font-pixel text-2xl tabular-nums"
            style={{
              color: timerDanger ? '#FF1744' : '#FFD700',
              textShadow: timerDanger
                ? '0 0 12px rgba(255,23,68,0.8)'
                : '0 0 12px rgba(255,215,0,0.6)',
            }}
          >
            {phase === 'calibrating' || phase === 'countdown' ? '60' : timerDisplay}
          </span>
        </div>

        {/* Opponent rounds */}
        <RoundDots count={opponent.roundsWon} color="#FF1744" align="right" />
      </div>

      {/* Health bars */}
      <div className="flex items-center gap-3">
        {/* Player bar */}
        <div className="flex-1">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-pixel text-[8px] text-[#00E676]">YOU</span>
            <span className="font-pixel text-[8px] text-white/40">{player.hp}</span>
          </div>
          <HealthBar hp={player.hp} color="#00E676" dimColor="#007832" rtl={false} blocking={player.blocking} />
        </div>

        {/* VS divider */}
        <span className="font-pixel text-xs text-white/20 flex-shrink-0">VS</span>

        {/* Opponent bar */}
        <div className="flex-1">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-pixel text-[8px] text-white/40">{opponent.hp}</span>
            <span className="font-pixel text-[8px] text-[#FF1744]">CPU</span>
          </div>
          <HealthBar hp={opponent.hp} color="#FF1744" dimColor="#8B0000" rtl={true} blocking={opponent.blocking} />
        </div>
      </div>
    </div>
  )
}

function HealthBar({
  hp,
  color,
  dimColor,
  rtl,
  blocking,
}: {
  hp: number
  color: string
  dimColor: string
  rtl: boolean
  blocking: boolean
}) {
  const pct = Math.max(0, Math.min(100, hp))
  const segments = 20
  const filled = Math.round((pct / 100) * segments)

  return (
    <div
      className="flex gap-[3px] h-5"
      style={{ flexDirection: rtl ? 'row-reverse' : 'row' }}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = rtl ? i < filled : i < filled
        return (
          <div
            key={i}
            className="flex-1 h-full transition-colors duration-75"
            style={{
              background: isActive ? color : '#1a1a1a',
              boxShadow: isActive && blocking ? `0 0 6px ${color}` : undefined,
              border: `1px solid ${isActive ? dimColor : '#222'}`,
            }}
          />
        )
      })}
    </div>
  )
}

function RoundDots({
  count,
  color,
  align,
}: {
  count: number
  color: string
  align: 'left' | 'right'
}) {
  return (
    <div className={`flex gap-2 items-center ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-3 h-3 border-2"
          style={{
            background: i < count ? color : 'transparent',
            borderColor: i < count ? color : '#333',
            boxShadow: i < count ? `0 0 6px ${color}` : 'none',
          }}
        />
      ))}
    </div>
  )
}
