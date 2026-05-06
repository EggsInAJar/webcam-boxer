'use client'

import { useEffect, useState } from 'react'
import { getIdentity } from '@/lib/identity'
import type { Identity } from '@/lib/identity'

type Props = {
  onEditUsername: () => void
}

export default function RatingBadge({ onEditUsername }: Props) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getIdentity()
      .then(setIdentity)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="h-5 w-40 bg-white/5 animate-pulse" aria-hidden />
  }

  if (!identity) return null

  const displayName = identity.username ?? `Guest-${identity.guestId.slice(0, 4).toUpperCase()}`

  return (
    <div className="flex items-center gap-3 font-pixel text-[8px]">
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>{displayName}</span>
      <span style={{ color: '#FFD700' }}>★ {identity.rating}</span>
      <button
        onClick={onEditUsername}
        className="text-white/20 hover:text-white/50 transition-colors"
        aria-label="Edit username"
      >
        [EDIT]
      </button>
    </div>
  )
}
