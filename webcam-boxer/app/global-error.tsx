'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center bg-[#080808] gap-6">
        <p className="font-pixel text-[10px] text-[#FF1744]">CRITICAL ERROR</p>
        <button className="btn-arcade" onClick={reset}>
          RESTART
        </button>
      </body>
    </html>
  )
}
