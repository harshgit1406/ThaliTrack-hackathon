import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { bootstrapAuthorized, hashToken, newOpaqueToken, requirePrincipal, verifyPassword } from '../auth.js'
import type { BackendConfig } from '../config.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'

const bootstrapSchema = z.object({
  display_name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  device_name: z.string().trim().min(1).max(160).default('Bootstrap administrator'),
})

const staffSessionSchema = z.object({
  outlet_id: z.string().uuid(),
  terminal_id: z.string().uuid(),
  employee_code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  pin: z.string().regex(/^\d{4,12}$/),
})

const demoSessionSchema = z.object({ role: z.enum(['student_aarav', 'student_meera', 'manager']) })

export async function registerAuthRoutes(app: FastifyInstance, pool: pg.Pool, config: BackendConfig): Promise<void> {
  app.post('/v1/auth/demo-session', async (request, reply) => {
    if (!config.demoMode) throw new AppError('DEMO_MODE_DISABLED', 'Demo sign-in is disabled.', 403)
    const input = demoSessionSchema.parse(request.body)
    const userIds = {
      student_aarav: 'a0000000-0000-4000-8000-000000000002',
      student_meera: 'a0000000-0000-4000-8000-000000000003',
      manager: 'a0000000-0000-4000-8000-000000000004',
    } as const
    const user = await pool.query<{ id: string; display_name: string; phone_e164: string | null }>(
      'SELECT id, display_name, phone_e164 FROM mealy.app_users WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
      [userIds[input.role], 'active'],
    )
    if (!user.rows[0]) throw new AppError('DEMO_DATA_REQUIRED', 'Load the development sample dataset before using demo sign-in.', 503)
    const token = newOpaqueToken()
    const expiresAt = new Date(Date.now() + Math.min(config.sessionTtlHours, 12) * 3_600_000)
    await pool.query(`
      INSERT INTO mealy.user_sessions (user_id, token_hash, device_name, expires_at, ip_address, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [user.rows[0].id, hashToken(token), `ThaliTrack demo ${input.role}`, expiresAt, request.ip, request.headers['user-agent'] ?? null])
    return reply.status(201).send({ data: { user: user.rows[0], token, expires_at: expiresAt.toISOString(), demo: true } })
  })

  app.post('/v1/auth/staff-session', async (request, reply) => {
    const input = staffSessionSchema.parse(request.body)
    const blocked = await pool.query(`
      SELECT count(*)::int AS attempts FROM mealy.staff_login_attempts
      WHERE employee_code = $1 AND outlet_id = $2 AND succeeded = false
        AND attempted_at > now() - interval '15 minutes'
    `, [input.employee_code, input.outlet_id])
    if (Number(blocked.rows[0]?.attempts ?? 0) >= 5) {
      throw new AppError('STAFF_LOGIN_LOCKED', 'Too many unsuccessful attempts. Try again in 15 minutes.', 429)
    }

    const result = await pool.query<{
      user_id: string; display_name: string; password_hash: string | null; membership_id: string;
      canteen_id: string | null; outlet_id: string | null
    }>(`
      SELECT users.id AS user_id, users.display_name, users.password_hash, memberships.id AS membership_id,
             memberships.canteen_id, memberships.outlet_id
      FROM mealy.access_memberships memberships
      JOIN mealy.app_users users ON users.id = memberships.user_id
      JOIN mealy.outlets outlet ON outlet.id = $2
      JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
      WHERE upper(memberships.employee_code) = $1 AND memberships.status = 'active'
        AND users.status = 'active' AND users.deleted_at IS NULL
        AND (memberships.outlet_id = $2 OR (memberships.outlet_id IS NULL AND memberships.canteen_id = link.canteen_id))
        AND (memberships.starts_at IS NULL OR memberships.starts_at <= now())
        AND (memberships.ends_at IS NULL OR memberships.ends_at > now())
      LIMIT 1
    `, [input.employee_code, input.outlet_id])
    const staff = result.rows[0]
    const terminal = await pool.query<{ id: string }>(`
      SELECT id FROM mealy.pos_terminals WHERE id = $1 AND outlet_id = $2 AND status = 'active'
    `, [input.terminal_id, input.outlet_id])
    const authenticated = Boolean(staff && terminal.rows[0] && verifyPassword(input.pin, staff.password_hash))
    await pool.query(`
      INSERT INTO mealy.staff_login_attempts (employee_code, outlet_id, terminal_id, ip_address, succeeded)
      VALUES ($1,$2,$3,$4,$5)
    `, [input.employee_code, input.outlet_id, input.terminal_id, request.ip, authenticated])
    if (!authenticated || !staff) {
      throw new AppError('INVALID_STAFF_CREDENTIALS', 'Employee code or PIN is incorrect.', 401)
    }

    const allowed = await pool.query(`
      SELECT 1 FROM mealy.membership_roles assigned
      JOIN mealy.role_permissions permission ON permission.role_id = assigned.role_id
      WHERE assigned.membership_id = $1 AND permission.permission_code = 'pos.use'
    `, [staff.membership_id])
    if (!allowed.rows[0]) {
      throw new AppError('POS_ACCESS_DENIED', 'This staff account cannot use the POS.', 403)
    }

    const token = newOpaqueToken()
    const expiresAt = new Date(Date.now() + Math.min(config.sessionTtlHours, 12) * 3_600_000)
    await pool.query(`
      INSERT INTO mealy.user_sessions (user_id, token_hash, device_name, expires_at, ip_address, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [staff.user_id, hashToken(token), `POS ${input.terminal_id}`, expiresAt, request.ip, request.headers['user-agent'] ?? null])
    await pool.query('UPDATE mealy.app_users SET last_login_at = now(), updated_at = now() WHERE id = $1', [staff.user_id])
    return reply.status(201).send({
      data: {
        user: { id: staff.user_id, display_name: staff.display_name },
        context: { outlet_id: input.outlet_id, terminal_id: input.terminal_id },
        token,
        expires_at: expiresAt.toISOString(),
      },
    })
  })

  app.post('/v1/auth/bootstrap-session', async (request, reply) => {
    bootstrapAuthorized(request, config)
    const input = bootstrapSchema.parse(request.body)
    const token = newOpaqueToken()
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000)

    const user = await transaction(pool, async (client) => {
      const userResult = await client.query<{ id: string; display_name: string; email: string }>(`
        INSERT INTO mealy.app_users (display_name, email, email_verified_at, status)
        VALUES ($1, $2, now(), 'active')
        ON CONFLICT ((lower(email))) WHERE email IS NOT NULL AND deleted_at IS NULL
        DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active', updated_at = now()
        RETURNING id, display_name, email
      `, [input.display_name, input.email])
      const current = userResult.rows[0]!
      const membership = await client.query<{ id: string }>(`
        INSERT INTO mealy.access_memberships (user_id, scope_type, status, starts_at)
        VALUES ($1, 'platform', 'active', now())
        ON CONFLICT (user_id) WHERE scope_type = 'platform' AND status <> 'ended'
        DO UPDATE SET status = 'active', starts_at = COALESCE(mealy.access_memberships.starts_at, now())
        RETURNING id
      `, [current.id])
      await client.query(`
        INSERT INTO mealy.membership_roles (membership_id, role_id, assigned_by)
        SELECT $1, id, $2 FROM mealy.roles WHERE scope_type = 'platform' AND code = 'super_admin'
        ON CONFLICT (membership_id, role_id) DO NOTHING
      `, [membership.rows[0]!.id, current.id])
      await client.query(`
        INSERT INTO mealy.user_sessions (user_id, token_hash, device_name, expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [current.id, hashToken(token), input.device_name, expiresAt, request.ip, request.headers['user-agent'] ?? null])
      return current
    })

    return reply.status(201).send({ data: { user, token, expires_at: expiresAt.toISOString() } })
  })

  app.get('/v1/auth/me', async (request) => ({ data: { user: requirePrincipal(request) } }))

  app.post('/v1/auth/logout', async (request, reply) => {
    requirePrincipal(request)
    const token = request.headers.authorization!.slice(7).trim()
    await pool.query('UPDATE mealy.user_sessions SET revoked_at = now() WHERE token_hash = $1', [hashToken(token)])
    return reply.status(204).send()
  })
}
