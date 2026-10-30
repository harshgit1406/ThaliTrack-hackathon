import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { resolvePrincipal } from './auth.js'
import type { BackendConfig } from './config.js'
import { registerErrorHandler } from './errors.js'
import { registerAdminRoutes } from './modules/admin.js'
import { registerAuthRoutes } from './modules/auth.js'
import { registerCatalogRoutes } from './modules/catalog.js'
import { registerGatewayRoutes } from './modules/gateway.js'
import { registerKitchenRoutes } from './modules/kitchen.js'
import { registerManagementRoutes } from './modules/management.js'
import { registerManagementSetupRoutes } from './modules/management-setup.js'
import { registerOrderRoutes } from './modules/orders.js'
import { registerPaymentRoutes } from './modules/payments.js'
import { registerPosRoutes } from './modules/pos.js'
import { registerPricingRoutes } from './modules/pricing.js'
import { registerStudentRoutes } from './modules/student.js'
import { registerThaliTrackRoutes } from './modules/thalitrack.js'

export async function buildApi(config: BackendConfig, pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxy,
    bodyLimit: config.bodyLimitBytes,
    requestIdHeader: false,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id']
      return typeof supplied === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(supplied) ? supplied : randomUUID()
    },
  })
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  })
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health' || request.url === '/ready',
    errorResponseBuilder: (request) => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', request_id: request.id } }),
  })
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-mealy-bootstrap-token', 'x-provider-event-id', 'x-request-id'],
  })
  registerErrorHandler(app)

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('cache-control', request.url === '/health' || request.url === '/ready' ? 'no-cache' : 'no-store')
    return payload
  })

  app.addHook('preHandler', async (request) => {
    request.principal = await resolvePrincipal(pool, request)
  })

  app.get('/health', async () => ({ data: { status: 'ok', service: 'api', time: new Date().toISOString() } }))
  app.get('/ready', async () => {
    const result = await pool.query<{ schema_version: number }>('SELECT schema_version FROM mealy.schema_metadata WHERE singleton')
    return { data: { status: result.rows[0]?.schema_version === 12 ? 'ready' : 'migrations_required', schema_version: result.rows[0]?.schema_version } }
  })

  await app.register(async (authApp) => {
    await authApp.register(rateLimit, { max: config.authRateLimitMax, timeWindow: '1 minute' })
    await registerAuthRoutes(authApp, pool, config)
  })
  await registerStudentRoutes(app, pool, config)
  await registerThaliTrackRoutes(app, pool)
  await registerCatalogRoutes(app, pool)
  await registerPricingRoutes(app, pool)
  await registerOrderRoutes(app, pool, config)
  await registerPaymentRoutes(app, pool)
  await registerPosRoutes(app, pool)
  await registerKitchenRoutes(app, pool)
  await registerAdminRoutes(app, pool)
  await registerManagementRoutes(app, pool)
  await registerManagementSetupRoutes(app, pool)
  await registerGatewayRoutes(app, pool)
  return app
}
