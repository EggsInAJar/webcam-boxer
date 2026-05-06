'use client'

type Status = 'connecting' | 'live' | 'reconnecting' | 'offline'

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  connecting:   { label: 'CONNECTING',   color: '#FFD700' },
  live:         { label: 'LIVE',         color: '#00E676' },
  reconnecting: { label: 'RECONNECTING', color: '#FF9800' },
  offline:      { label: 'OFFLINE',      color: '#FF1744' },
}

export default function ConnectionStatus({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div className="flex items-center gap-2 font-pixel text-[7px]">
      <span
        className="w-2 h-2 rounded-full"
        style={{
          background: cfg.color,
          boxShadow: status === 'live' ? `0 0 6px ${cfg.color}` : undefined,
        }}
        aria-hidden
      />
      <span style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}
