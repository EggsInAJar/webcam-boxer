import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('getEnv', () => {
  const REQUIRED = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SOCKET_URL',
  ]

  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    NEXT_PUBLIC_SOCKET_URL: 'http://localhost:3001',
  }

  beforeEach(() => {
    vi.resetModules()
    for (const key of REQUIRED) delete process.env[key]
  })

  afterEach(() => {
    vi.resetModules()
    for (const key of REQUIRED) delete process.env[key]
  })

  it('throws when all required vars are missing', async () => {
    const { getEnv } = await import('../env')
    expect(() => getEnv()).toThrow(/Missing required environment variables/)
  })

  it('includes each missing var name in the error message', async () => {
    const { getEnv } = await import('../env')
    try {
      getEnv()
    } catch (e: unknown) {
      const msg = (e as Error).message
      for (const key of REQUIRED) expect(msg).toContain(key)
    }
  })

  it('returns the env object when all vars are set', async () => {
    Object.assign(process.env, validEnv)
    const { getEnv } = await import('../env')
    const env = getEnv()
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
    expect(env.NEXT_PUBLIC_SOCKET_URL).toBe('http://localhost:3001')
  })

  it('throws listing only the missing var when one is absent', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    // NEXT_PUBLIC_SOCKET_URL intentionally omitted
    const { getEnv } = await import('../env')
    expect(() => getEnv()).toThrow('NEXT_PUBLIC_SOCKET_URL')
  })

  it('does not throw when no vars are missing', async () => {
    Object.assign(process.env, validEnv)
    const { getEnv } = await import('../env')
    expect(() => getEnv()).not.toThrow()
  })

  it('returns the same cached object on repeated calls', async () => {
    Object.assign(process.env, validEnv)
    const { getEnv } = await import('../env')
    const first = getEnv()
    const second = getEnv()
    expect(first).toBe(second)
  })

  it('resetEnvCache clears cached result so env is re-evaluated', async () => {
    Object.assign(process.env, validEnv)
    const { getEnv, resetEnvCache } = await import('../env')
    getEnv() // populate cache
    for (const key of REQUIRED) delete process.env[key]
    resetEnvCache()
    expect(() => getEnv()).toThrow(/Missing required environment variables/)
  })
})
