import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GatewayConfig } from './config.js'
import { EventHub } from './event-hub.js'
import { GatewayRepository } from './repository.js'
import { buildGatewayServer } from './server.js'
import { SyncWorker } from './sync-worker.js'

const cleanupPaths: string[] = []

afterEach(() => {
  for (const cleanupPath of cleanupPaths.splice(0)) rmSync(cleanupPath, { recursive: true, force: true })
})

function createHarness() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'mealy-gateway-'))
  cleanupPaths.push(dataDir)
  const config: GatewayConfig = {
    gatewayId: 'gateway-test', outletId: 'outlet-test', outletName: 'Test Canteen',
    stationId: 'station-test', stationName: 'Main Kitchen', host: '127.0.0.1', port: 8787,
    dataDir, databasePath: path.join(dataDir, 'gateway.sqlite'), lanToken: 'test-lan-token',
    allowedOrigins: ['http://127.0.0.1:5173', 'http://127.0.0.1:8787'],
    kdsDistDir: path.join(dataDir, 'missing-kds'), syncIntervalMs: 5_000, isProduction: false,
    bodyLimitBytes: 262_144, rateLimitMax: 300,
    maxSseClients: 25, cloudRequestTimeoutMs: 10_000,
  }
  const eventHub = new EventHub()
  const repository = new GatewayRepository(config.databasePath, (event) => eventHub.publish(event))
  const syncWorker = new SyncWorker(config, repository)
  return { config, eventHub, repository, syncWorker }
}

const orderPayload = {
  orderId: 'order-1',
  ticketId: 'ticket-1',
  orderNumber: 'ORD-1',
  kotNumber: 'KOT-1',
  token: 'A-1',
  source: 'Counter POS',
  promisedMinutes: 12,
  items: [
    { id: 'item-1', name: 'Masala Dosa', quantity: 2, modifiers: ['Extra crispy'] },
    { id: 'item-2', name: 'Cold Coffee', quantity: 1 },
  ],
} as const

describe('outlet gateway', () => {
  it('protects the LAN API while keeping health available', async () => {
    const harness = createHarness()
    const app = await buildGatewayServer({ ...harness, logger: false })

    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
    expect(health.headers['x-content-type-options']).toBe('nosniff')
    expect(health.headers['content-security-policy']).toContain("default-src 'self'")
    expect((await app.inject({ method: 'GET', url: '/v1/kitchen/tickets' })).statusCode).toBe(401)
    expect((await app.inject({
      method: 'GET', url: '/v1/kitchen/tickets', headers: { 'x-mealy-gateway-token': 'test-lan-token' },
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'GET',
      url: '/v1/kitchen/tickets',
      headers: { origin: 'http://malicious.example', 'x-mealy-gateway-token': 'test-lan-token' },
    })).statusCode).toBe(403)

    const oversized = await app.inject({
      method: 'POST', url: '/v1/orders',
      headers: { 'content-type': 'application/json', 'x-mealy-gateway-token': 'test-lan-token' },
      payload: JSON.stringify({ padding: 'x'.repeat(300_000) }),
    })
    expect(oversized.statusCode).toBe(413)
    expect(oversized.json().error.code).toBe('PAYLOAD_TOO_LARGE')
    expect((await app.inject({
      method: 'GET',
      url: '/v1/kitchen/tickets',
      headers: { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', 'x-mealy-gateway-token': 'test-lan-token' },
    })).statusCode).toBe(200)

    await app.close()
    harness.repository.close()
  })

  it('persists idempotent orders and enforces item readiness before order readiness', async () => {
    const harness = createHarness()
    const app = await buildGatewayServer({ ...harness, logger: false })
    const headers = { 'x-mealy-gateway-token': 'test-lan-token' }

    const create = await app.inject({
      method: 'POST', url: '/v1/orders', headers: { ...headers, 'idempotency-key': 'create-order-1' }, payload: orderPayload,
    })
    expect(create.statusCode).toBe(201)
    expect(create.json().data.ticket.status).toBe('new')

    const retry = await app.inject({
      method: 'POST', url: '/v1/orders', headers: { ...headers, 'idempotency-key': 'create-order-1' }, payload: orderPayload,
    })
    expect(retry.statusCode).toBe(201)
    expect(retry.json().data.ticket.id).toBe('ticket-1')

    expect((await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/start', headers })).statusCode).toBe(200)
    const delayed = await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/delay', headers, payload: { minutes: 5, reason: 'Equipment queue' } })
    expect(delayed.statusCode).toBe(200)
    expect(delayed.json().data.ticket.promisedMinutes).toBe(17)
    expect((await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/ready', headers })).statusCode).toBe(409)

    expect((await app.inject({
      method: 'POST', url: '/v1/kitchen/tickets/ticket-1/items/item-1/readiness', headers, payload: { ready: true },
    })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/ready', headers })).statusCode).toBe(409)
    expect((await app.inject({
      method: 'POST', url: '/v1/kitchen/tickets/ticket-1/items/item-2/readiness', headers, payload: { ready: true },
    })).statusCode).toBe(200)

    const ready = await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/ready', headers })
    expect(ready.statusCode).toBe(200)
    expect(ready.json().data.ticket.status).toBe('ready')
    const remake = await app.inject({ method: 'POST', url: '/v1/kitchen/tickets/ticket-1/remake', headers, payload: { reason: 'Quality check failed' } })
    expect(remake.statusCode).toBe(200)
    expect(remake.json().data.ticket.status).toBe('preparing')
    expect(remake.json().data.ticket.items.every((item: { status: string }) => item.status === 'pending')).toBe(true)
    expect(harness.repository.getSyncStatus().pending).toBe(7)

    await app.close()
    harness.repository.close()

    const reopened = new GatewayRepository(harness.config.databasePath)
    expect(reopened.getTicket('ticket-1').status).toBe('preparing')
    expect(reopened.getTicket('ticket-1').items.every((item) => item.status === 'pending')).toBe(true)
    reopened.close()
  })

  it('rejects reuse of an idempotency key for different order content', async () => {
    const harness = createHarness()
    const app = await buildGatewayServer({ ...harness, logger: false })
    const headers = { 'x-mealy-gateway-token': 'test-lan-token', 'idempotency-key': 'shared-key' }
    await app.inject({ method: 'POST', url: '/v1/orders', headers, payload: orderPayload })
    const conflict = await app.inject({
      method: 'POST', url: '/v1/orders', headers, payload: { ...orderPayload, token: 'A-2' },
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT')

    await app.close()
    harness.repository.close()
  })
})
