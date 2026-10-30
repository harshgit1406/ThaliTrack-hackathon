import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashToken, newOpaqueToken, requirePrincipal } from '../auth.js'
import type { BackendConfig } from '../config.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'

const phoneSchema = z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'Use an international phone number, for example +919876543210.')
const discoverySchema = z.object({ latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() })
const requestOtpSchema = z.object({ phone: phoneSchema, purpose: z.enum(['sign_in', 'sign_up']).default('sign_in') })
const verifyOtpSchema = z.object({ challenge_id: z.string().uuid(), phone: phoneSchema, code: z.string().regex(/^\d{6}$/), display_name: z.string().trim().min(1).max(160).optional(), device_name: z.string().trim().min(1).max(160).default('Student web') })

function distanceSql(): string {
  return `CASE WHEN $1::numeric IS NULL OR $2::numeric IS NULL OR campus.latitude IS NULL OR campus.longitude IS NULL THEN NULL ELSE
    6371 * acos(LEAST(1, GREATEST(-1, cos(radians($1)) * cos(radians(campus.latitude)) * cos(radians(campus.longitude) - radians($2)) + sin(radians($1)) * sin(radians(campus.latitude))))) END`
}

export async function registerStudentRoutes(app: FastifyInstance, pool: pg.Pool, config: BackendConfig): Promise<void> {
  app.get('/v1/student/discovery', async (request) => {
    const query = discoverySchema.parse(request.query)
    const campuses = await pool.query(`
      SELECT campus.id, campus.name, campus.latitude, campus.longitude, ${distanceSql()} AS distance_km,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
          'id', outlet.id, 'name', outlet.name, 'canteen_id', canteen.id, 'canteen_name', canteen.name,
          'accepts_orders', outlet.accepts_orders, 'preparation_lead_minutes', outlet.preparation_lead_minutes,
          'counter_id', counter.id, 'counter_name', counter.name
        )) FILTER (WHERE outlet.id IS NOT NULL), '[]'::jsonb) AS outlets
      FROM mealy.campuses campus
      LEFT JOIN mealy.campus_canteens assignment ON assignment.campus_id = campus.id AND assignment.status = 'active'
      LEFT JOIN mealy.canteens canteen ON canteen.id = assignment.canteen_id AND canteen.status = 'active' AND canteen.archived_at IS NULL
      LEFT JOIN mealy.outlets outlet ON outlet.campus_canteen_id = assignment.id AND outlet.status = 'active' AND outlet.archived_at IS NULL
      LEFT JOIN LATERAL (SELECT id, name FROM mealy.service_counters WHERE outlet_id = outlet.id AND status = 'active' ORDER BY created_at LIMIT 1) counter ON true
      WHERE campus.status = 'active' AND campus.archived_at IS NULL
      GROUP BY campus.id
      ORDER BY distance_km NULLS LAST, campus.name
    `, [query.latitude ?? null, query.longitude ?? null])
    return { data: { campuses: campuses.rows } }
  })

  app.post('/v1/student/auth/otp/request', async (request, reply) => {
    const input = requestOtpSchema.parse(request.body)
    if (config.otpProvider === 'unconfigured') throw new AppError('OTP_PROVIDER_UNAVAILABLE', 'Phone sign-in is not configured yet.', 503)
    const destinationHash = hashToken(input.phone)
    const recent = await pool.query<{ count: string }>(`SELECT count(*) FROM mealy.login_challenges WHERE destination_hash = $1 AND created_at > now() - interval '10 minutes'`, [destinationHash])
    if (Number(recent.rows[0]?.count ?? 0) >= 5) throw new AppError('OTP_RATE_LIMITED', 'Please wait before requesting another code.', 429)
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await pool.query(`UPDATE mealy.login_challenges SET invalidated_at = now() WHERE destination_hash = $1 AND purpose IN ('sign_in','sign_up') AND consumed_at IS NULL AND invalidated_at IS NULL`, [destinationHash])
    const result = await pool.query<{ id: string; expires_at: Date }>(`INSERT INTO mealy.login_challenges (channel, destination_hash, code_hash, purpose, expires_at) VALUES ('sms', $1, $2, $3, now() + interval '10 minutes') RETURNING id, expires_at`, [destinationHash, hashToken(code), input.purpose])
    const challenge = result.rows[0]!
    app.log.info({ phone_last4: input.phone.slice(-4), code, challenge_id: challenge.id }, 'Local development OTP issued')
    return reply.status(201).send({ data: { challenge_id: challenge.id, expires_at: challenge.expires_at.toISOString(), delivery: 'local_console' } })
  })

  app.post('/v1/student/auth/otp/verify', async (request, reply) => {
    const input = verifyOtpSchema.parse(request.body)
    const destinationHash = hashToken(input.phone)
    const token = newOpaqueToken()
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000)
    const result = await transaction(pool, async (client) => {
      const challengeResult = await client.query<{ id: string; code_hash: string; attempts: number; max_attempts: number }>(`
        SELECT id, code_hash, attempts, max_attempts FROM mealy.login_challenges
        WHERE id = $1 AND destination_hash = $2 AND channel = 'sms' AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now() FOR UPDATE
      `, [input.challenge_id, destinationHash])
      const challenge = challengeResult.rows[0]
      if (!challenge || challenge.attempts >= challenge.max_attempts) throw new AppError('OTP_INVALID_OR_EXPIRED', 'That code is invalid or expired. Request a new code.', 401)
      if (challenge.code_hash !== hashToken(input.code)) {
        await client.query('UPDATE mealy.login_challenges SET attempts = attempts + 1 WHERE id = $1', [input.challenge_id])
        throw new AppError('OTP_INVALID_OR_EXPIRED', 'That code is invalid or expired. Request a new code.', 401)
      }
      await client.query('UPDATE mealy.login_challenges SET consumed_at = now() WHERE id = $1', [input.challenge_id])
      const existing = await client.query<{ id: string; display_name: string; phone_e164: string }>('SELECT id, display_name, phone_e164 FROM mealy.app_users WHERE phone_e164 = $1 AND deleted_at IS NULL FOR UPDATE', [input.phone])
      let user = existing.rows[0]
      if (!user) {
        if (!input.display_name) throw new AppError('STUDENT_NAME_REQUIRED', 'Enter your name to create your Mealy account.', 422)
        const created = await client.query<{ id: string; display_name: string; phone_e164: string }>(`INSERT INTO mealy.app_users (display_name, phone_e164, phone_verified_at, status, last_login_at) VALUES ($1,$2,now(),'active',now()) RETURNING id, display_name, phone_e164`, [input.display_name, input.phone])
        user = created.rows[0]!
        await client.query('INSERT INTO mealy.student_profiles (user_id) VALUES ($1)', [user.id])
        await client.query(`INSERT INTO mealy.auth_identities (user_id, provider, provider_subject) VALUES ($1,'phone_otp',$2)`, [user.id, input.phone])
      } else await client.query('UPDATE mealy.app_users SET phone_verified_at = now(), last_login_at = now(), updated_at = now() WHERE id = $1', [user.id])
      await client.query('INSERT INTO mealy.user_sessions (user_id, token_hash, device_name, expires_at, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, hashToken(token), input.device_name, expiresAt, request.ip, request.headers['user-agent'] ?? null])
      return user
    })
    return reply.status(201).send({ data: { user: result, token, expires_at: expiresAt.toISOString() } })
  })

  app.get('/v1/student/me', async (request) => ({ data: { user: requirePrincipal(request) } }))
}
