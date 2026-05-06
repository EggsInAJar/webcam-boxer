import type { NextConfig } from 'next'

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'
const socketWs = socketUrl.replace(/^http/, 'ws')

// CSP for production; relaxed in dev to allow HMR websocket
const isDev = process.env.NODE_ENV === 'development'

const csp = [
  "default-src 'self'",
  // Scripts: self + Next.js inline eval in dev
  isDev ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline'",
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
