import type { FastifyRequest } from 'fastify'
import type pg from 'pg'
import { hashToken } from './auth.js'
import { AppError } from './errors.js'

export type GatewayPrincipal = { id: string; gatewayKey: string; outletId: string; lastAcknowledgedSequence: number }

export async function authenticateGateway(pool: pg.Pool, request: FastifyRequest, explicitToken?: string): Promise<GatewayPrincipal> {
  const authorization = explicitToken ?? request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new AppError('GATEWAY_AUTH_REQUIRED', 'A valid gateway token is required.', 401)
  const result = await pool.query<{
    id: string; gateway_key: string; outlet_id: string; last_acknowledged_sequence: string
  }>(`
    SELECT id, gateway_key, outlet_id, last_acknowledged_sequence
    FROM mealy.outlet_gateways WHERE token_hash = $1 AND status = 'active'
  `, [hashToken(token)])
  const gateway = result.rows[0]
  if (!gateway) throw new AppError('GATEWAY_AUTH_REQUIRED', 'A valid gateway token is required.', 401)
  return {
    id: gateway.id,
    gatewayKey: gateway.gateway_key,
    outletId: gateway.outlet_id,
    lastAcknowledgedSequence: Number(gateway.last_acknowledged_sequence),
  }
}
