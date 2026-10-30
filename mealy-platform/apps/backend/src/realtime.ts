import websocket from '@fastify/websocket'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { readConfig } from './config.js'
import { createPool } from './database.js'
import { AppError, registerErrorHandler } from './errors.js'
import { authenticateGateway, type GatewayPrincipal } from './gateway-auth.js'

type GatewayConnection = {
  socket: WebSocket
  gateway: GatewayPrincipal
  cursor: number
  sentThrough: number
  awaitingAck: boolean
  lastPongAt: number
}

const config = readConfig()
const pool = createPool(config)
const app = Fastify({
  logger: true,
  trustProxy: config.trustProxy,
  bodyLimit: config.bodyLimitBytes,
  requestIdHeader: false,
  genReqId: () => randomUUID(),
})
registerErrorHandler(app)
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
})
await app.register(rateLimit, { max: config.authRateLimitMax, timeWindow: '1 minute' })
await app.register(websocket, { options: { maxPayload: config.realtimeMaxPayloadBytes, perMessageDeflate: false } })
const connections = new Map<string, GatewayConnection>()

app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('cache-control', 'no-cache')
  return payload
})

app.get('/health', async () => ({ data: { status: 'ok', service: 'realtime', time: new Date().toISOString() } }))

app.get('/v1/realtime/gateway', { websocket: true }, async (socket, request) => {
  try {
    const origin = request.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) throw new AppError('ORIGIN_NOT_ALLOWED', 'This WebSocket origin is not allowed.', 403)
    const gateway = await authenticateGateway(pool, request)
    const prior = connections.get(gateway.id)
    if (!prior && connections.size >= config.realtimeMaxConnections) {
      throw new AppError('CONNECTION_LIMIT_REACHED', 'The realtime service is at capacity.', 503)
    }
    if (prior) prior.socket.close(4001, 'Replaced by a newer gateway connection')
    const connection: GatewayConnection = {
      socket, gateway, cursor: gateway.lastAcknowledgedSequence,
      sentThrough: gateway.lastAcknowledgedSequence, awaitingAck: false, lastPongAt: Date.now(),
    }
    connections.set(gateway.id, connection)
    await pool.query('UPDATE mealy.outlet_gateways SET last_connected_at = now(), last_seen_at = now() WHERE id = $1', [gateway.id])
    socket.send(JSON.stringify({ type: 'hello', gateway_id: gateway.gatewayKey, outlet_id: gateway.outletId, cursor: connection.cursor }))

    socket.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; sequence?: number }
        if (message.type === 'pong') {
          connection.lastPongAt = Date.now()
          return
        }
        if (message.type === 'resume' && Number.isSafeInteger(message.sequence) && Number(message.sequence) >= connection.cursor) {
          connection.cursor = Number(message.sequence)
          connection.sentThrough = connection.cursor
          connection.awaitingAck = false
          return
        }
        if (message.type === 'ack' && Number.isSafeInteger(message.sequence)) {
          const sequence = Number(message.sequence)
          if (sequence < connection.cursor || sequence > connection.sentThrough) throw new AppError('INVALID_ACK', 'Acknowledgement sequence is outside the sent range.', 409)
          connection.cursor = sequence
          connection.awaitingAck = false
          connection.lastPongAt = Date.now()
          await pool.query(`
            UPDATE mealy.outlet_gateways SET last_acknowledged_sequence = GREATEST(last_acknowledged_sequence, $2), last_seen_at = now()
            WHERE id = $1
          `, [gateway.id, sequence])
        }
      } catch (error) {
        app.log.warn({ err: error, gateway_id: gateway.gatewayKey }, 'Rejected gateway WebSocket message')
        socket.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE' }))
      }
    })
    socket.on('close', () => {
      if (connections.get(gateway.id)?.socket === socket) connections.delete(gateway.id)
    })
  } catch (error) {
    app.log.warn({ err: error }, 'Gateway WebSocket authentication failed')
    socket.close(4003, 'Authentication failed')
  }
})

const deliveryTimer = setInterval(async () => {
  for (const connection of connections.values()) {
    if (connection.socket.readyState !== WebSocket.OPEN || connection.awaitingAck) continue
    try {
      const events = await pool.query(`
        SELECT sequence, event_id, event_type, aggregate_type, aggregate_id, payload, occurred_at
        FROM mealy.cloud_gateway_events
        WHERE outlet_id = $1 AND sequence > $2 ORDER BY sequence LIMIT 100
      `, [connection.gateway.outletId, connection.cursor])
      if (events.rows.length === 0) continue
      connection.sentThrough = Number(events.rows.at(-1)!.sequence)
      connection.awaitingAck = true
      connection.socket.send(JSON.stringify({ type: 'events', from_sequence: connection.cursor + 1, through_sequence: connection.sentThrough, events: events.rows }))
    } catch (error) {
      app.log.error({ err: error, gateway_id: connection.gateway.gatewayKey }, 'Unable to deliver gateway events')
    }
  }
}, config.realtimePollMs)
deliveryTimer.unref()

const heartbeatTimer = setInterval(() => {
  const now = Date.now()
  for (const connection of connections.values()) {
    if (now - connection.lastPongAt > config.gatewayStaleMs) {
      connection.socket.close(4000, 'Heartbeat timeout')
      continue
    }
    if (connection.socket.readyState === WebSocket.OPEN) connection.socket.send(JSON.stringify({ type: 'ping', at: new Date().toISOString() }))
  }
}, config.gatewayHeartbeatMs)
heartbeatTimer.unref()

const shutdown = async () => {
  clearInterval(deliveryTimer)
  clearInterval(heartbeatTimer)
  for (const connection of connections.values()) connection.socket.close(1001, 'Server shutting down')
  await app.close()
  await pool.end()
}
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

await app.listen({ host: config.realtimeHost, port: config.realtimePort })
