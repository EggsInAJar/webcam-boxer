import type { NextConfig } from 'next'

// Normalize NEXT_PUBLIC_SOCKET_URL into both http(s):// and ws(s):// variants so
// CSP allows the Socket.IO upgrade regardless of how the env var is formatted.
// Accepts: "host", "host:port", "https://host", "https://host/", etc.
function deriveSocketOrigins(raw: string): { http: string; ws: string } {
  const trimmed = raw.replace(/\/+$/, '')
  const hasScheme = /^[a-z]+:\/\//i.test(trimmed)
  const isLocal = /(^|\/\/)(localhost|127\.0\.0\.1)(:|$|\/)/i.test(trimmed)
  const httpScheme = isLocal ? 'http' : 'https'
  const httpOrigin = hasScheme ? trimmed : `${httpScheme}://${trimmed}`
  const wsOrigin = httpOrigin.replace(/^http/, 'ws')
  return { http: httpOrigin, ws: wsOrigin }
}

const { http: socketUrl, ws: socketWs } = deriveSocketOrigins(
  process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'
)

// CSP for production; relaxed in dev to allow HMR websocket
const isDev = process.env.NODE_ENV === 'development'

const csp = [
  "default-src 'self'",
  // Scripts: self + inline styles. 'wasm-unsafe-eval' is required for MediaPipe WASM in production.
  // 'unsafe-eval' is additionally needed in dev for Next.js HMR.
  isDev ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  // Styles: self + Tailwind inline
  "style-src 'self' 'unsafe-inline'",
  // Media: webcam (blob: for canvas captures)
  "media-src 'self' blob:",
  // Workers: WASM threads need blob worker
  "worker-src 'self' blob:",
  // Images: self + data URIs
  "img-src 'self' data: blob:",
  // Connections: API + socket server + supabase
  [
    'connect-src',
    "'self'",
    socketUrl,
    socketWs,
    // Supabase — configured at runtime so allow *.supabase.co wildcard
    'https://*.supabase.co',
    'wss://*.supabase.co',
    // CDN fallback for MediaPipe in case local assets fail
    'https://cdn.jsdelivr.net',
    'https://storage.googleapis.com',
  ].join(' '),
  // Fonts
  "font-src 'self'",
  // Frames
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          // HSTS only applies in production (Vercel sets this automatically, but be explicit)
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
        ],
      },
    ]
  },
}

export default nextConfig
