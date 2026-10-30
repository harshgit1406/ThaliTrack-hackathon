import { describe, expect, it } from 'vitest'
import { buildApi } from './app.js'
import { readConfig } from './config.js'

const config = readConfig({
  NODE_ENV: 'test',
  MEALY_DATABASE_URL: 'postgresql://unused',
  MEALY_ALLOWED_ORIGINS: 'https://admin.mealy.test',
  MEALY_BODY_LIMIT_BYTES: '1024',
  MEALY_RATE_LIMIT_MAX: '100',
  MEALY_AUTH_RATE_LIMIT_MAX: '2',
})

const pool = {
  query: async () => ({ rows: [] }),
} as never

describe('API security boundary', () => {
  it('adds defensive headers and does not allow an unknown browser origin', async () => {
    const app = await buildApi(config, pool)
    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(response.headers['cache-control']).toBe('no-cache')
    await app.close()
  })

  it('rejects oversized JSON before route processing', async () => {
    const app = await buildApi(config, pool)
    const response = await app.inject({
      method: 'POST', url: '/v1/pricing/quote',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(2_000) }),
    })
    expect(response.statusCode).toBe(413)
    await app.close()
  })

  it('rate limits repeated authentication requests', async () => {
    const app = await buildApi(config, pool)
    await app.inject({ method: 'GET', url: '/v1/auth/me' })
    await app.inject({ method: 'GET', url: '/v1/auth/me' })
    const response = await app.inject({ method: 'GET', url: '/v1/auth/me' })
    expect(response.statusCode).toBe(429)
    expect(response.json().error.code).toBe('RATE_LIMITED')
    await app.close()
  })
})
