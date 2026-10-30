import { existsSync } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import type { GatewayConfig } from './config.js'
import { createOrderSchema, delayTicketSchema, GatewayError, itemReadinessSchema, remakeTicketSchema } from './domain.js'
import type { EventHub } from './event-hub.js'
import type { GatewayRepository } from './repository.js'
import type { SyncWorker } from './sync-worker.js'

type ServerDependencies = {
  config: GatewayConfig
  repository: GatewayRepository
  eventHub: EventHub
  syncWorker: SyncWorker
  logger?: boolean
}

function tokensEqual(left: unknown, right: string): boolean {
  if (typeof left !== 'string') return false
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}

export async function buildGatewayServer({
  config,
  repository,
  eventHub,
  syncWorker,
  logger = true,
}: ServerDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: config.bodyLimitBytes, requestIdHeader: false })

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
        baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
  })
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health',
    errorResponseBuilder: (request) => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', request_id: request.id } }),
  })

  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
    allowedHeaders: ['content-type', 'idempotency-key', 'x-mealy-gateway-token', 'last-event-id'],
    methods: ['GET', 'POST', 'OPTIONS'],
  })

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/v1/')) return

    const origin = request.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) {
      throw new GatewayError('ORIGIN_NOT_ALLOWED', 'This origin is not allowed by the outlet gateway.', 403)
    }

    if (config.lanToken && !tokensEqual(request.headers['x-mealy-gateway-token'], config.lanToken)) {
      throw new GatewayError('GATEWAY_AUTH_REQUIRED', 'A valid outlet gateway token is required.', 401)
    }
    if (request.url.startsWith('/v1/kitchen/') && (!repository.hasCapability('kot', Boolean(config.cloudUrl)) || !repository.hasCapability('kds', Boolean(config.cloudUrl)))) {
      throw new GatewayError('FEATURE_DISABLED', 'Kitchen display is not enabled for this outlet.', 403)
    }
    if (request.url === '/v1/orders' && !repository.hasCapability('pos', Boolean(config.cloudUrl))) {
      throw new GatewayError('FEATURE_DISABLED', 'Counter POS is not enabled for this outlet.', 403)
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('cache-control', request.url === '/health' ? 'no-cache' : 'no-store')
    return payload
  })

  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (error instanceof GatewayError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, request_id: request.id } })
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload is invalid.',
          fields: error.flatten().fieldErrors,
          request_id: request.id,
        },
      })
    }
    if (statusCode === 413) {
      return reply.status(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request payload is too large.', request_id: request.id } })
    }
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', request_id: request.id } })
    }
    if (statusCode === 400) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'The request could not be parsed.', request_id: request.id } })
    }
    request.log.error(error)
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The gateway could not complete this request.', request_id: request.id } })
  })

  app.get('/health', async () => ({
    data: {
      status: repository.isHealthy() ? 'ok' : 'unavailable',
      service: 'outlet-gateway',
      time: new Date().toISOString(),
    },
  }))

  app.get('/v1/context', async () => ({
    data: {
      gateway_id: config.gatewayId,
      outlet: { id: config.outletId, name: config.outletName },
      station: { id: config.stationId, name: config.stationName },
      counter_id: config.counterId,
      terminal_id: config.terminalId,
      reserved_offline_tokens: repository.remainingReservedTokens(config.counterId),
      capabilities: repository.getCapabilities(),
    },
  }))

  app.get('/v1/kitchen/tickets', async () => ({
    data: { tickets: repository.getTickets() },
    meta: { generated_at: new Date().toISOString() },
  }))

  app.post('/v1/orders', async (request, reply) => {
    const input = createOrderSchema.parse(request.body)
    const idempotencyKey = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/).parse(request.headers['idempotency-key'])
    const ticket = repository.createOrder(input, idempotencyKey)
    return reply.status(201).send({ data: { ticket } })
  })

  app.post<{ Params: { ticketId: string } }>('/v1/kitchen/tickets/:ticketId/start', async (request) => ({
    data: { ticket: repository.startTicket(request.params.ticketId) },
  }))

  app.post<{ Params: { ticketId: string; itemId: string } }>('/v1/kitchen/tickets/:ticketId/items/:itemId/readiness', async (request) => {
    const body = itemReadinessSchema.parse(request.body)
    return { data: { ticket: repository.setItemReadiness(request.params.ticketId, request.params.itemId, body.ready) } }
  })

  app.post<{ Params: { ticketId: string } }>('/v1/kitchen/tickets/:ticketId/ready', async (request) => ({
    data: { ticket: repository.markTicketReady(request.params.ticketId) },
  }))

  app.post<{ Params: { ticketId: string } }>('/v1/kitchen/tickets/:ticketId/delay', async (request) => {
    const body = delayTicketSchema.parse(request.body)
    return { data: { ticket: repository.delayTicket(request.params.ticketId, body.minutes, body.reason) } }
  })

  app.post<{ Params: { ticketId: string } }>('/v1/kitchen/tickets/:ticketId/remake', async (request) => {
    const body = remakeTicketSchema.parse(request.body)
    return { data: { ticket: repository.remakeTicket(request.params.ticketId, body.reason) } }
  })

  app.get('/v1/sync/status', async () => ({
    data: {
      mode: config.cloudUrl ? 'cloud_sync' : 'local_only',
      ...repository.getSyncStatus(),
      connected_kds_clients: eventHub.clientCount,
    },
  }))

  app.post('/v1/sync/flush', async () => {
    await syncWorker.flush()
    return { data: repository.getSyncStatus() }
  })

  app.get('/v1/events', async (request, reply) => {
    if (eventHub.clientCount >= config.maxSseClients) throw new GatewayError('CONNECTION_LIMIT_REACHED', 'The gateway event stream is at capacity.', 503)
    const lastEventId = Number(request.headers['last-event-id'] ?? 0)
    reply.hijack()
    const response = reply.raw as ServerResponse
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.write('retry: 1500\n\n')
    for (const event of repository.getEventsAfter(Number.isFinite(lastEventId) ? lastEventId : 0)) {
      response.write(`id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    const remove = eventHub.addClient(response)
    request.raw.on('close', remove)
  })

  if (existsSync(config.kdsDistDir)) {
    await app.register(fastifyStatic, {
      root: config.kdsDistDir,
      prefix: '/kds/',
      wildcard: false,
    })
    app.get('/kds', async (_request, reply) => reply.redirect('/kds/'))
    app.get('/kds/*', async (_request, reply) => reply.sendFile('index.html'))
    app.get('/', async (_request, reply) => reply.redirect('/kds/'))
  } else {
    app.get('/', async () => ({
      data: {
        service: 'Mealy Outlet Gateway',
        message: 'Gateway is running. Build apps/kds to serve the kitchen display from /kds/.',
      },
    }))
  }

  return app
}
