'use client'

import { useState, useEffect, useRef } from 'react'
import { setUsername } from '@/lib/identity'
import { isProfane } from '@/lib/profanity'

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

type AvailStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'profane'

type Props = {
  currentUsername: string | null
  onSave: (username: string) => void
  onCancel: () => void
}

export default function UsernamePrompt({ currentUsername, onSave, onCancel }: Props) {
  const [value, setValue] = useState(currentUsername ?? '')
  const [availStatus, setAvailStatus] = useState<AvailStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const formatValid = USERNAME_RE.test(value)
  const canSubmit = formatValid && availStatus !== 'taken' && availStatus !== 'profane' && !saving

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value) {
      setAvailStatus('idle')
      return
    }
    if (!USERNAME_RE.test(value)) {
      setAvailStatus('invalid')
      return
    }
    if (isProfane(value)) {
      setAvailStatus('profane')
      return
    }
    // Skip check if unchanged from current saved username
    if (value === currentUsername) {
      setAvailStatus('available')
      return
    }

    setAvailStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-check?username=${encodeURIComponent(value)}`)
        const json = await res.json()
        setAvailStatus(json.available ? 'available' : 'taken')
      } catch {
        setAvailStatus('idle')
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, currentUsername])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    setSaveError(null)
    try {
      const updated = await setUsername(value)
      onSave(updated.username!)
    } catch (err: unknown) {
      setSaveError((err as Error).message ?? 'Failed to save username')
    } finally {
      setSaving(false)
    }
  }

  const statusLabel: Record<AvailStatus, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: 'CHECKING...', color: 'rgba(255,255,255,0.4)' },
    available: { text: 'AVAILABLE', color: '#00E676' },
    taken: { text: 'ALREADY TAKEN', color: '#FF1744' },
    invalid: { text: 'INVALID FORMAT', color: '#FF1744' },
    profane: { text: 'NOT ALLOWED', color: '#FF1744' },
  }

  const hint = statusLabel[availStatus]

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Set username"
    >
      <div className="border border-[#FFD700]/30 bg-[#0d0d0d] p-8 flex flex-col gap-6 w-full max-w-sm mx-4">
        <p className="font-pixel text-[10px]" style={{ color: '#FFD700' }}>
          SET USERNAME
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setSaveError(null)
              }}
              placeholder="3-16 CHARS: A-Z 0-9 _"
              maxLength={16}
              autoFocus
              aria-label="Username"
              aria-describedby="username-hint"
              className="bg-[#111] border border-white/20 text-white font-pixel text-[8px] px-3 py-2 outline-none focus:border-[#FFD700]/60 placeholder:text-white/20"
            />
            {hint && (
              <p
                id="username-hint"
                className="font-pixel text-[7px]"
                style={{ color: hint.color }}
                aria-live="polite"
              >
                {hint.text}
              </p>
            )}
          </div>

          {saveError && (
            <p className="font-pixel text-[7px]" style={{ color: '#FF1744' }} role="alert">
              {saveError.toUpperCase()}
            </p>
          )}

          <div className="flex gap-3 items-center">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-arcade flex-1 disabled:opacity-40"
            >
              {saving ? 'SAVING...' : 'SAVE'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="font-pixel text-[8px] text-white/30 hover:text-white/50 px-3"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
