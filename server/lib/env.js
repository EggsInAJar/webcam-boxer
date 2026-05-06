const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IDENTITY_SIGNING_SECRET',
  'ALLOWED_ORIGINS',
]

export function loadEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    signingSecret: process.env.IDENTITY_SIGNING_SECRET,
    allowedOrigins: process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
    port: parseInt(process.env.PORT ?? '3001', 10),
  }
}
