import { describe, expect, it } from 'vitest'
import { readGatewayConfig } from './config.js'

describe('gateway production configuration', () => {
  const base = {
    NODE_ENV: 'production',
    MEALY_GATEWAY_LAN_TOKEN: 'l'.repeat(32),
    MEALY_CLOUD_GATEWAY_TOKEN: 'c'.repeat(32),
  }

  it('requires encrypted cloud API and realtime transports', () => {
    expect(() => readGatewayConfig({ ...base, MEALY_CLOUD_URL: 'http://cloud.example' })).toThrow('HTTPS')
    expect(() => readGatewayConfig({ ...base, MEALY_CLOUD_REALTIME_URL: 'ws://cloud.example' })).toThrow('WSS')
  })

  it('requires a strong cloud token when cloud sync is enabled', () => {
    expect(() => readGatewayConfig({ ...base, MEALY_CLOUD_URL: 'https://cloud.example', MEALY_CLOUD_GATEWAY_TOKEN: 'short' })).toThrow('32 characters')
  })
})
