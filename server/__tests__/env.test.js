import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IDENTITY_SIGNING_SECRET',
  'ALLOWED_ORIGINS',
]

function clearEnv() {
  for (const k of REQUIRED) delete process.env[k]
  delete process.env.PORT
}

describe('loadEnv', () => {
  beforeEach(clearEnv)
  after(clearEnv)

  it('throws when all required vars are missing', async () => {
    const { loadEnv } = await import('../lib/env.js')
    assert.throws(() => loadEnv(), /Missing required env vars/)
  })

  it('includes each missing key in the error message', async () => {
    const { loadEnv } = await import('../lib/env.js')
    try {
      loadEnv()
      assert.fail('expected throw')
    } catch (e) {
      for (const key of REQUIRED) assert.ok(e.message.includes(key), `expected "${key}" in: ${e.message}`)
    }
  })

  it('returns config object when all vars are set', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    process.env.IDENTITY_SIGNING_SECRET = 'supersecret'
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com'
    process.env.PORT = '4000'

    const { loadEnv } = await import('../lib/env.js')
    const cfg = loadEnv()
    assert.equal(cfg.supabaseUrl, 'https://test.supabase.co')
    assert.deepEqual(cfg.allowedOrigins, ['http://localhost:3000', 'https://example.com'])
    assert.equal(cfg.port, 4000)
  })

  it('defaults PORT to 3001 when not set', async () => {
    process.env.SUPABASE_URL = 'u'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    process.env.IDENTITY_SIGNING_SECRET = 's'
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000'

    const { loadEnv } = await import('../lib/env.js')
    const cfg = loadEnv()
    assert.equal(cfg.port, 3001)
  })
})
