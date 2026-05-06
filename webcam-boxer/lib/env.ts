const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SOCKET_URL',
] as const

type EnvKey = (typeof REQUIRED)[number]
type Env = Record<EnvKey, string>

let _env: Env | null = null

export function getEnv(): Env {
  if (_env) return _env

  const missing: string[] = []
  const result = {} as Env

  for (const key of REQUIRED) {
    const val = process.env[key]
    if (!val) missing.push(key)
    else result[key] = val
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  _env = result
  return _env
}

export function resetEnvCache(): void {
  _env = null
}
