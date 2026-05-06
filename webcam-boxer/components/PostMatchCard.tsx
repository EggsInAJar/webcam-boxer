'use client'

import { useState } from 'react'
import type { MatchResultPayload } from '@/lib/socketClient'

type RematchStatus = 'idle' | 'waiting' | 'declined'

type Props = {
  result: MatchResultPayload
  mySide: 'left' | 'right'
  myRating: number
  ratingDelta?: number
  onFindNewOpponent: () => void
  onRematch: () => void
  rematchStatus: RematchStatus
}

export default function PostMatchCard({
  result,
  mySide,
  myRating,
  ratingDelta,
  onFindNewOpponent,
  onRematch,
  rematchStatus,
}: Props) {
  const won = result.winnerSide === mySide
  const drew = result.winnerSide === null
  const delta = ratingDelta ?? result.ratingDelta

  const reasonLabel: Record<string, string> = {
    ko: 'KNOCKOUT',
    timeout: 'TIME UP',
    forfeit: 'FORFEIT',
    disconnect: 'DISCONNECT',
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-20 bg-black/75">
      {/* Result banner */}
      <div
        className="font-pixel text-4xl md:text-6xl tracking-widest"
        style={{
          color: drew ? '#FFD700' : won ? '#00E676' : '#FF1744',
          textShadow: `0 0 30px ${drew ? 'rgba(255,215,0,0.8)' : won ? 'rgba(0,230,118,0.8)' : 'rgba(255,23,68,0.8)'}`,
        }}
      >
        {drew ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}
      </div>

      <p className="font-pixel text-[8px] text-white/40">
        {reasonLabel[result.reason] ?? result.reason.toUpperCase()}
      </p>

      {/* Rating */}
      <div className="flex flex-col items-center gap-1">
        <p className="font-pixel text-[8px] text-white/30">RATING</p>
        <div className="flex items-baseline gap-2 font-pixel">
          <span className="text-[10px]" style={{ color: '#FFD700' }}>★ {myRating}</span>
          {delta !== 0 && (
            <span
              className="text-[9px]"
              style={{ color: delta > 0 ? '#00E676' : '#FF1744' }}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        {/* Rematch button — hidden when opponent disconnected */}
        {result.reason !== 'disconnect' && (
          <button
            className="btn-arcade disabled:opacity-40"
            onClick={onRematch}
            disabled={rematchStatus === 'waiting' || rematchStatus === 'declined'}
          >
            {rematchStatus === 'waiting'
              ? 'WAITING FOR OPPONENT...'
              : rematchStatus === 'declined'
              ? 'REMATCH DECLINED'
              : 'REMATCH'}
          </button>
        )}

        <button className="btn-arcade" onClick={onFindNewOpponent}>
          FIND NEW OPPONENT
        </button>
        <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/50">
          MAIN MENU
        </a>
      </div>
    </div>
  )
}
