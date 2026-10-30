import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashToken, requirePermission } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'

const campusSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
  name: z.string().trim().min(2).max(200),
  timezone: z.string().trim().default('Asia/Kolkata'),
})

const onboardingSchema = z.object({
  campus_id: z.string().uuid(),
  canteen: z.object({ code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/), name: z.string().trim().min(2).max(200) }),
  outlet: z.object({ code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/), name: z.string().trim().min(1).max(160) }),
  counter: z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(160), token_prefix: z.string().max(12).default('') }),
})

const featureSchema = z.object({
  enabled: z.boolean(),
  configuration: z.record(z.string(), z.unknown()).default({}),
  effective_from: z.string().datetime().optional(),
  effective_until: z.string().datetime().optional(),
})

const gatewaySchema = z.object({
  outlet_id: z.string().uuid(),
  gateway_key: z.string().trim().min(3).max(120),
  display_name: z.string().trim().min(1).max(160),
})

export async function registerAdminRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get('/v1/admin/features', async (request) => {
    requirePermission(request, 'features.manage')
    const result = await pool.query(`
      SELECT definition.*,
        COALESCE(array_agg(feature.canteen_id::text) FILTER (
          WHERE feature.enabled
            AND feature.effective_from <= now()
            AND (feature.effective_until IS NULL OR feature.effective_until > now())
        ), '{}') AS enabled_for
      FROM mealy.feature_definitions definition
      LEFT JOIN mealy.canteen_features feature ON feature.feature_code = definition.code
      GROUP BY definition.code
      ORDER BY definition.code
    `)
    return { data: { features: result.rows } }
  })

  app.get('/v1/admin/campuses', async (request) => {
    requirePermission(request, 'campus.manage')
    const result = await pool.query(`
      SELECT campus.*,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
          'id', canteen.id, 'code', canteen.code, 'name', canteen.name, 'status', canteen.status,
          'support_email', canteen.support_email, 'support_phone', canteen.support_phone_e164,
          'outlets', (SELECT count(*) FROM mealy.outlets outlet WHERE outlet.campus_canteen_id = cc.id AND outlet.archived_at IS NULL),
          'admins', (SELECT count(*) FROM mealy.access_memberships membership WHERE membership.canteen_id = canteen.id AND membership.status = 'active'),
          'modules', (SELECT count(*) FROM mealy.canteen_features feature WHERE feature.canteen_id = canteen.id AND feature.enabled),
          'orders_today', (SELECT count(*) FROM mealy.orders orders JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id WHERE outlet.campus_canteen_id = cc.id AND orders.business_date = CURRENT_DATE),
          'outlet_records', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', outlet.id, 'name', outlet.name, 'status', outlet.status, 'accepts_orders', outlet.accepts_orders,
            'preparation_lead_minutes', outlet.preparation_lead_minutes,
            'counters', (SELECT count(*) FROM mealy.service_counters counter WHERE counter.outlet_id = outlet.id AND counter.status = 'active'),
            'terminals', (SELECT count(*) FROM mealy.pos_terminals terminal WHERE terminal.outlet_id = outlet.id AND terminal.status <> 'retired')
          ) ORDER BY outlet.name), '[]'::jsonb) FROM mealy.outlets outlet WHERE outlet.campus_canteen_id = cc.id AND outlet.archived_at IS NULL)
        ))
          FILTER (WHERE canteen.id IS NOT NULL), '[]'::jsonb) AS canteens
      FROM mealy.campuses campus
      LEFT JOIN mealy.campus_canteens cc ON cc.campus_id = campus.id
      LEFT JOIN mealy.canteens canteen ON canteen.id = cc.canteen_id
      WHERE campus.archived_at IS NULL GROUP BY campus.id ORDER BY campus.name
    `)
    return { data: { campuses: result.rows } }
  })

  app.get('/v1/admin/team', async (request) => {
    requirePermission(request, 'staff.manage')
    const result = await pool.query(`
      SELECT users.id, users.display_name, users.email, users.status, sessions.last_seen_at,
        COALESCE(array_agg(DISTINCT roles.name) FILTER (WHERE roles.id IS NOT NULL), '{}') AS roles,
        COALESCE(array_agg(DISTINCT memberships.scope_type) FILTER (WHERE memberships.id IS NOT NULL), '{}') AS scopes
      FROM mealy.app_users users
      LEFT JOIN mealy.access_memberships memberships ON memberships.user_id = users.id AND memberships.status <> 'ended'
      LEFT JOIN mealy.membership_roles assigned ON assigned.membership_id = memberships.id
      LEFT JOIN mealy.roles roles ON roles.id = assigned.role_id
      LEFT JOIN LATERAL (
        SELECT max(last_seen_at) AS last_seen_at FROM mealy.user_sessions WHERE user_id = users.id
      ) sessions ON true
      WHERE users.deleted_at IS NULL
      GROUP BY users.id, sessions.last_seen_at
      ORDER BY users.display_name
    `)
    return { data: { team: result.rows } }
  })

  app.get('/v1/admin/roles', async (request) => {
    requirePermission(request, 'staff.manage')
    const result = await pool.query(`
      SELECT roles.id, roles.code, roles.name, roles.scope_type, roles.is_system,
        count(DISTINCT assigned.membership_id)::int AS members,
        COALESCE(array_agg(DISTINCT permissions.description) FILTER (WHERE permissions.code IS NOT NULL), '{}') AS permissions
      FROM mealy.roles roles
      LEFT JOIN mealy.membership_roles assigned ON assigned.role_id = roles.id
      LEFT JOIN mealy.role_permissions grants ON grants.role_id = roles.id
      LEFT JOIN mealy.permissions permissions ON permissions.code = grants.permission_code
      GROUP BY roles.id ORDER BY roles.scope_type, roles.name
    `)
    return { data: { roles: result.rows } }
  })

  app.get('/v1/admin/audit', async (request) => {
    requirePermission(request, 'audit.read')
    const result = await pool.query(`
      SELECT logs.id::text, COALESCE(users.display_name, initcap(logs.actor_type)) AS actor,
        logs.action, concat(logs.entity_type, CASE WHEN logs.entity_id IS NULL THEN '' ELSE ' ' || logs.entity_id::text END) AS target,
        COALESCE(canteens.name, campuses.name, 'Platform') AS scope, logs.occurred_at, permissions.risk_level
      FROM mealy.audit_logs logs
      LEFT JOIN mealy.app_users users ON users.id = logs.actor_user_id
      LEFT JOIN mealy.canteens canteens ON canteens.id = logs.canteen_id
      LEFT JOIN mealy.campuses campuses ON campuses.id = logs.campus_id
      LEFT JOIN mealy.permissions permissions ON permissions.code = logs.action
      ORDER BY logs.occurred_at DESC LIMIT 100
    `)
    return { data: { audit: result.rows } }
  })

  app.get('/v1/admin/operations', async (request) => {
    requirePermission(request, 'orders.read')
    const result = await pool.query(`
      SELECT gateway.id::text, 'critical' AS severity, 'Outlet gateway offline' AS title,
        'No recent gateway heartbeat is available.' AS detail, canteen.name AS canteen,
        gateway.last_seen_at AS occurred_at, 'Sync' AS kind
      FROM mealy.outlet_gateways gateway
      JOIN mealy.outlets outlet ON outlet.id = gateway.outlet_id
      JOIN mealy.campus_canteens assignment ON assignment.id = outlet.campus_canteen_id
      JOIN mealy.canteens canteen ON canteen.id = assignment.canteen_id
      WHERE gateway.status = 'active' AND (gateway.last_seen_at IS NULL OR gateway.last_seen_at < now() - interval '5 minutes')
      UNION ALL
      SELECT kot.id::text, 'warning', 'Kitchen ticket delayed', 'Preparation exceeded the outlet lead time.', canteen.name,
        kot.fired_at, 'KOT'
      FROM mealy.kots kot
      JOIN mealy.orders orders ON orders.id = kot.order_id
      JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id
      JOIN mealy.campus_canteens assignment ON assignment.id = outlet.campus_canteen_id
      JOIN mealy.canteens canteen ON canteen.id = assignment.canteen_id
      WHERE kot.status IN ('queued','accepted','preparing')
        AND kot.fired_at < now() - make_interval(mins => outlet.preparation_lead_minutes)
      ORDER BY occurred_at DESC LIMIT 100
    `)
    return { data: { alerts: result.rows } }
  })

  app.post('/v1/admin/campuses', async (request, reply) => {
    const principal = requirePermission(request, 'campus.manage')
    const input = campusSchema.parse(request.body)
    const result = await pool.query(`
      INSERT INTO mealy.campuses (code, name, timezone, status, created_by)
      VALUES ($1,$2,$3,'active',$4) RETURNING *
    `, [input.code, input.name, input.timezone, principal.userId])
    return reply.status(201).send({ data: { campus: result.rows[0] } })
  })

  app.post('/v1/admin/canteens/onboard', async (request, reply) => {
    const principal = requirePermission(request, 'canteen.manage')
    const input = onboardingSchema.parse(request.body)
    const result = await transaction(pool, async (client) => {
      const canteen = await client.query<{ id: string }>(`
        INSERT INTO mealy.canteens (code, name, status, created_by) VALUES ($1,$2,'onboarding',$3) RETURNING *
      `, [input.canteen.code, input.canteen.name, principal.userId])
      const assignment = await client.query<{ id: string }>(`
        INSERT INTO mealy.campus_canteens (campus_id, canteen_id, status) VALUES ($1,$2,'active') RETURNING id
      `, [input.campus_id, canteen.rows[0]!.id])
      const outlet = await client.query<{ id: string }>(`
        INSERT INTO mealy.outlets (campus_canteen_id, code, name, status, accepts_orders)
        VALUES ($1,$2,$3,'active',false) RETURNING *
      `, [assignment.rows[0]!.id, input.outlet.code, input.outlet.name])
      const counter = await client.query(`
        INSERT INTO mealy.service_counters (outlet_id, code, name, token_prefix)
        VALUES ($1,$2,$3,$4) RETURNING *
      `, [outlet.rows[0]!.id, input.counter.code, input.counter.name, input.counter.token_prefix])
      await client.query(`
        INSERT INTO mealy.kitchen_stations (outlet_id, code, name, display_order)
        VALUES ($1,'MAIN','Main Kitchen',0)
      `, [outlet.rows[0]!.id])
      await client.query(`
        INSERT INTO mealy.canteen_features (canteen_id, feature_code, enabled, updated_by)
        SELECT $1, code, default_enabled, $2 FROM mealy.feature_definitions
      `, [canteen.rows[0]!.id, principal.userId])
      return { canteen: canteen.rows[0], outlet: outlet.rows[0], counter: counter.rows[0] }
    })
    return reply.status(201).send({ data: result })
  })

  app.put<{ Params: { canteenId: string; featureCode: string } }>('/v1/admin/canteens/:canteenId/features/:featureCode', async (request) => {
    const canteenId = z.string().uuid().parse(request.params.canteenId)
    const featureCode = z.string().trim().min(1).max(80).parse(request.params.featureCode)
    const principal = requirePermission(request, 'features.manage')
    const input = featureSchema.parse(request.body)
    const dependencies: Record<string, string[]> = { kds: ['kot'], printing: ['kot'], qr_ordering: ['student_ordering'] }
    if (input.enabled && dependencies[featureCode]) {
      const missing = await pool.query<{ code: string }>(`
        SELECT dependency.code FROM unnest($2::text[]) AS dependency(code)
        JOIN mealy.feature_definitions definition ON definition.code = dependency.code
        LEFT JOIN mealy.canteen_features feature ON feature.canteen_id = $1 AND feature.feature_code = dependency.code
        WHERE NOT COALESCE(feature.enabled, definition.default_enabled)
      `, [canteenId, dependencies[featureCode]])
      if (missing.rows.length > 0) throw new AppError('FEATURE_DEPENDENCY_MISSING', 'Required modules must be enabled first.', 409, { missing: missing.rows.map((row) => row.code) })
    }
    if (!input.enabled && featureCode === 'kot') {
      const dependents = await pool.query<{ feature_code: string }>(`
        SELECT feature_code FROM mealy.canteen_features
        WHERE canteen_id = $1 AND enabled AND feature_code IN ('kds','printing')
      `, [canteenId])
      if (dependents.rows.length > 0) throw new AppError('FEATURE_DEPENDENTS_ACTIVE', 'Disable dependent modules before disabling KOT.', 409, { dependents: dependents.rows.map((row) => row.feature_code) })
    }
    const result = await pool.query(`
      INSERT INTO mealy.canteen_features (
        canteen_id, feature_code, enabled, configuration, effective_from, effective_until, updated_by
      ) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7)
      ON CONFLICT (canteen_id, feature_code) DO UPDATE SET
        enabled = EXCLUDED.enabled, configuration = EXCLUDED.configuration,
        effective_from = EXCLUDED.effective_from, effective_until = EXCLUDED.effective_until,
        updated_by = EXCLUDED.updated_by, updated_at = now()
      RETURNING *
    `, [canteenId, featureCode, input.enabled, input.configuration, input.effective_from ?? null, input.effective_until ?? null, principal.userId])
    if (!result.rows[0]) throw new AppError('FEATURE_NOT_FOUND', 'Feature was not found.', 404)
    return { data: { entitlement: result.rows[0] } }
  })

  app.post('/v1/admin/gateways', async (request, reply) => {
    requirePermission(request, 'outlet.manage')
    const input = gatewaySchema.parse(request.body)
    const token = randomBytes(32).toString('base64url')
    const result = await pool.query(`
      INSERT INTO mealy.outlet_gateways (outlet_id, gateway_key, display_name, token_hash, status)
      VALUES ($1,$2,$3,$4,'active')
      ON CONFLICT (outlet_id, display_name) DO UPDATE SET
        gateway_key = EXCLUDED.gateway_key, token_hash = EXCLUDED.token_hash, status = 'active', updated_at = now(),
        last_acknowledged_sequence = 0
      RETURNING id, outlet_id, gateway_key, display_name, status, created_at
    `, [input.outlet_id, input.gateway_key, input.display_name, hashToken(token)])
    return reply.status(201).send({ data: { gateway: result.rows[0], token } })
  })
}
