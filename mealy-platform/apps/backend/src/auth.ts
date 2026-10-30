import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type pg from 'pg'
import type { BackendConfig } from './config.js'
import { AppError } from './errors.js'

export type Principal = {
  userId: string
  displayName: string
  email?: string
  phone?: string
  memberships: Array<{ scopeType: string; campusId?: string; canteenId?: string; outletId?: string; permissions: string[] }>
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokensEqual(left: string | undefined, right: string): boolean {
  if (!left) return false
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 32)
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const [algorithm, saltValue, hashValue] = stored.split(':')
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false
  try {
    const expected = Buffer.from(hashValue, 'base64url')
    const actual = scryptSync(password, Buffer.from(saltValue, 'base64url'), expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export async function resolvePrincipal(pool: pg.Pool, request: FastifyRequest): Promise<Principal | undefined> {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice(7).trim()
  if (!token) return undefined

  const result = await pool.query<{
    user_id: string
    display_name: string
    email: string | null
    phone_e164: string | null
    scope_type: string | null
    campus_id: string | null
    canteen_id: string | null
    outlet_id: string | null
    permissions: string[] | null
  }>(`
    SELECT u.id AS user_id, u.display_name, u.email, u.phone_e164,
           m.scope_type, m.campus_id, m.canteen_id, m.outlet_id,
           COALESCE(array_agg(DISTINCT rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
    FROM mealy.user_sessions s
    JOIN mealy.app_users u ON u.id = s.user_id
    LEFT JOIN mealy.access_memberships m ON m.user_id = u.id AND m.status = 'active'
      AND (m.starts_at IS NULL OR m.starts_at <= now()) AND (m.ends_at IS NULL OR m.ends_at > now())
    LEFT JOIN mealy.membership_roles mr ON mr.membership_id = m.id
    LEFT JOIN mealy.role_permissions rp ON rp.role_id = mr.role_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      AND u.status = 'active' AND u.deleted_at IS NULL
    GROUP BY u.id, u.display_name, u.email, u.phone_e164, m.id
  `, [hashToken(token)])

  const first = result.rows[0]
  if (!first) return undefined
  void pool.query('UPDATE mealy.user_sessions SET last_seen_at = now() WHERE token_hash = $1', [hashToken(token)]).catch((error) => {
    request.log.warn({ err: error }, 'Unable to update session activity')
  })
  return {
    userId: first.user_id,
    displayName: first.display_name,
    email: first.email ?? undefined,
    phone: first.phone_e164 ?? undefined,
    memberships: result.rows.filter((row) => row.scope_type).map((row) => ({
      scopeType: row.scope_type!,
      campusId: row.campus_id ?? undefined,
      canteenId: row.canteen_id ?? undefined,
      outletId: row.outlet_id ?? undefined,
      permissions: row.permissions ?? [],
    })),
  }
}

export function requirePrincipal(request: FastifyRequest): Principal {
  if (!request.principal) throw new AppError('AUTHENTICATION_REQUIRED', 'Sign in is required.', 401)
  return request.principal
}

export function requirePermission(request: FastifyRequest, permission: string, scope?: { canteenId?: string; outletId?: string }): Principal {
  const principal = requirePrincipal(request)
  const allowed = principal.memberships.some((membership) => {
    const scopeMatches = membership.scopeType === 'platform'
      || (Boolean(scope?.outletId) && (
        (membership.scopeType === 'outlet' && membership.outletId === scope?.outletId)
        || (membership.scopeType === 'canteen' && membership.canteenId === scope?.canteenId)
      ))
      || (!scope?.outletId && Boolean(scope?.canteenId) && membership.scopeType === 'canteen' && membership.canteenId === scope?.canteenId)
    return scopeMatches && membership.permissions.includes(permission)
  })
  if (!allowed) throw new AppError('PERMISSION_DENIED', 'You are not allowed to perform this action.', 403)
  return principal
}

export async function requireOutletPermission(
  pool: pg.Pool | pg.PoolClient,
  request: FastifyRequest,
  permission: string,
  outletId: string,
): Promise<Principal> {
  const scope = await pool.query<{ canteen_id: string }>(`
    SELECT link.canteen_id FROM mealy.outlets outlet
    JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
    WHERE outlet.id = $1 AND outlet.archived_at IS NULL
  `, [outletId])
  if (!scope.rows[0]) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found.', 404)
  return requirePermission(request, permission, { outletId, canteenId: scope.rows[0].canteen_id })
}

export function bootstrapAuthorized(request: FastifyRequest, config: BackendConfig): void {
  if (!config.bootstrapEnabled) throw new AppError('BOOTSTRAP_DISABLED', 'Administrator bootstrap is disabled.', 403)
  const supplied = request.headers['x-mealy-bootstrap-token']
  if (typeof supplied !== 'string' || !tokensEqual(supplied, config.bootstrapToken)) {
    throw new AppError('BOOTSTRAP_AUTH_REQUIRED', 'A valid bootstrap token is required.', 401)
  }
}
