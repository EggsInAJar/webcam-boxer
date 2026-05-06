'use client'

export default function OnlineError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808] gap-6">
      <p className="font-pixel text-[10px] text-[#FF1744]">CONNECTION ERROR</p>
      <p className="font-pixel text-[7px] text-white/30">{error.message}</p>
      <div className="flex gap-4">
        <button className="btn-arcade" onClick={reset}>
          RECONNECT
        </button>
        <a href="/" className="font-pixel text-[8px] text-white/30 hover:text-white/50">
          MAIN MENU
        </a>
      </div>
    </div>
  )
}
