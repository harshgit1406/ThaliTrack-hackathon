import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashPassword, requirePermission, requirePrincipal } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { requiredIdempotencyKey } from '../request-security.js'

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  price_minor: z.number().int().nonnegative(),
  food_type: z.enum(['vegetarian', 'non_vegetarian', 'vegan', 'egg', 'unspecified']),
  preparation_minutes: z.number().int().min(0).max(1440),
})

const staffSchema = z.object({
  outlet_id: z.string().uuid().optional(),
  display_name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  employee_code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  role_code: z.enum(['canteen_manager', 'outlet_manager', 'cashier', 'kitchen']),
  pin: z.string().regex(/^\d{4,12}$/),
})

const stockAdjustmentSchema = z.object({
  outlet_id: z.string().uuid(),
  quantity_delta: z.number().finite().refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(300),
})

export async function registerManagementRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get('/v1/management/snapshot', async (request) => {
    const principal = requirePrincipal(request)
    const permissionScope = (permission: string): string[] | null | undefined => {
      if (principal.memberships.some((membership) => membership.scopeType === 'platform' && membership.permissions.includes(permission))) return null
      const ids = [...new Set(principal.memberships.flatMap((membership) => (
        membership.scopeType === 'canteen' && membership.canteenId && membership.permissions.includes(permission) ? [membership.canteenId] : []
      )))]
      return ids.length > 0 ? ids : undefined
    }
    const scope = permissionScope('reports.read')
    if (scope === undefined) throw new AppError('PERMISSION_DENIED', 'Canteen reporting access is required.', 403)
    const teamScope = permissionScope('staff.manage')
    const auditScope = permissionScope('audit.read')

    const [canteens, outlets, orders, items, team, audit] = await Promise.all([
      pool.query(`
        SELECT canteen.id, canteen.name, canteen.status, string_agg(DISTINCT campus.name, ', ' ORDER BY campus.name) AS campus,
          (SELECT count(*) FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = canteen.id AND outlet.archived_at IS NULL)::int AS outlets,
          (SELECT count(*) FROM mealy.orders orders JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = canteen.id AND orders.business_date = CURRENT_DATE)::int AS orders,
          (SELECT COALESCE(sum(orders.total_minor), 0) FROM mealy.orders orders JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = canteen.id AND orders.business_date = CURRENT_DATE)::bigint AS order_value,
          (SELECT COALESCE(round(avg(extract(epoch FROM (kot.ready_at - kot.fired_at)) / 60)), 0) FROM mealy.kots kot JOIN mealy.orders orders ON orders.id = kot.order_id JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE link.canteen_id = canteen.id AND kot.ready_at IS NOT NULL)::int AS average_prep
        FROM mealy.canteens canteen
        JOIN mealy.campus_canteens link ON link.canteen_id = canteen.id
        JOIN mealy.campuses campus ON campus.id = link.campus_id
        WHERE canteen.archived_at IS NULL AND ($1::uuid[] IS NULL OR canteen.id = ANY($1))
        GROUP BY canteen.id ORDER BY canteen.name
      `, [scope]),
      pool.query(`
        SELECT outlet.id, link.canteen_id, outlet.name, outlet.status, outlet.accepts_orders,
          outlet.preparation_lead_minutes,
          (SELECT count(*) FROM mealy.service_counters counter WHERE counter.outlet_id = outlet.id AND counter.status = 'active')::int AS counters,
          (SELECT count(*) FROM mealy.pos_terminals terminal WHERE terminal.outlet_id = outlet.id AND terminal.status <> 'retired')::int AS terminals
        FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
        WHERE outlet.archived_at IS NULL AND ($1::uuid[] IS NULL OR link.canteen_id = ANY($1)) ORDER BY outlet.name
      `, [scope]),
      pool.query(`
        SELECT orders.id, orders.public_number, link.canteen_id, token.token_label, orders.customer_name_snapshot,
          orders.source_channel, orders.total_minor, orders.status_code, orders.placed_at,
          (SELECT count(*) FROM mealy.order_items item WHERE item.order_id = orders.id)::int AS item_count
        FROM mealy.orders orders
        JOIN mealy.outlets outlet ON outlet.id = orders.outlet_id
        JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
        LEFT JOIN mealy.order_tokens token ON token.order_id = orders.id AND token.voided_at IS NULL
        WHERE ($1::uuid[] IS NULL OR link.canteen_id = ANY($1)) ORDER BY orders.placed_at DESC LIMIT 200
      `, [scope]),
      pool.query(`
        SELECT item.id, item.canteen_id, item.name, category.name AS category, item.base_price_minor,
          item.food_type, item.preparation_minutes,
          bool_and(COALESCE(settings.is_available, true) AND (settings.sold_out_until IS NULL OR settings.sold_out_until <= now())) AS is_available,
          COALESCE((SELECT floor(sum(balance.on_hand - balance.reserved))::int FROM mealy.recipes recipe JOIN mealy.inventory_balances balance ON balance.inventory_item_id = recipe.inventory_item_id WHERE recipe.item_id = item.id), 0) AS stock
        FROM mealy.catalog_items item
        LEFT JOIN mealy.catalog_categories category ON category.id = item.primary_category_id
        LEFT JOIN mealy.campus_canteens link ON link.canteen_id = item.canteen_id
        LEFT JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id AND outlet.archived_at IS NULL
        LEFT JOIN mealy.outlet_item_settings settings ON settings.outlet_id = outlet.id AND settings.item_id = item.id
        WHERE item.archived_at IS NULL AND ($1::uuid[] IS NULL OR item.canteen_id = ANY($1))
        GROUP BY item.id, category.name ORDER BY item.name
      `, [scope]),
      teamScope === undefined ? Promise.resolve({ rows: [] }) : pool.query(`
        SELECT users.id, users.display_name, memberships.canteen_id, users.status, roles.name AS role,
          sessions.last_seen_at
        FROM mealy.access_memberships memberships
        JOIN mealy.app_users users ON users.id = memberships.user_id
        LEFT JOIN mealy.membership_roles assigned ON assigned.membership_id = memberships.id
        LEFT JOIN mealy.roles roles ON roles.id = assigned.role_id
        LEFT JOIN LATERAL (SELECT max(last_seen_at) AS last_seen_at FROM mealy.user_sessions WHERE user_id = users.id) sessions ON true
        WHERE memberships.status <> 'ended' AND memberships.canteen_id IS NOT NULL
          AND ($1::uuid[] IS NULL OR memberships.canteen_id = ANY($1))
        ORDER BY users.display_name
      `, [teamScope]),
      auditScope === undefined ? Promise.resolve({ rows: [] }) : pool.query(`
        SELECT logs.id::text, logs.canteen_id, COALESCE(users.display_name, initcap(logs.actor_type)) AS actor,
          logs.action, logs.entity_type AS target, logs.occurred_at
        FROM mealy.audit_logs logs LEFT JOIN mealy.app_users users ON users.id = logs.actor_user_id
        WHERE ($1::uuid[] IS NULL OR logs.canteen_id = ANY($1)) ORDER BY logs.occurred_at DESC LIMIT 100
      `, [auditScope]),
    ])

    return { data: { canteens: canteens.rows, outlets: outlets.rows, orders: orders.rows, items: items.rows, team: team.rows, activities: audit.rows, alerts: [] } }
  })

  app.put<{ Params: { canteenId: string; itemId: string } }>('/v1/management/canteens/:canteenId/items/:itemId/availability', async (request) => {
    const canteenId = z.string().uuid().parse(request.params.canteenId)
    const itemId = z.string().uuid().parse(request.params.itemId)
    const { is_available } = z.object({ is_available: z.boolean() }).parse(request.body)
    requirePermission(request, 'catalog.manage', { canteenId })
    await pool.query(`
      INSERT INTO mealy.outlet_item_settings (outlet_id, item_id, is_available, updated_at)
      SELECT outlet.id, item.id, $3, now()
      FROM mealy.catalog_items item
      JOIN mealy.campus_canteens link ON link.canteen_id = item.canteen_id
      JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id AND outlet.archived_at IS NULL
      WHERE item.canteen_id = $1 AND item.id = $2 AND item.archived_at IS NULL
      ON CONFLICT (outlet_id, item_id) DO UPDATE SET is_available = EXCLUDED.is_available, updated_at = now()
    `, [canteenId, itemId, is_available])
    return { data: { item_id: itemId, is_available } }
  })

  app.put<{ Params: { outletId: string } }>('/v1/management/outlets/:outletId/accepting-orders', async (request) => {
    const outletId = z.string().uuid().parse(request.params.outletId)
    const { accepts_orders } = z.object({ accepts_orders: z.boolean() }).parse(request.body)
    const scope = await pool.query<{ canteen_id: string }>(`
      SELECT link.canteen_id FROM mealy.outlets outlet
      JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE outlet.id = $1
    `, [outletId])
    requirePermission(request, 'outlet.manage', { canteenId: scope.rows[0]?.canteen_id, outletId })
    await pool.query('UPDATE mealy.outlets SET accepts_orders = $2, updated_at = now() WHERE id = $1', [outletId, accepts_orders])
    return { data: { outlet_id: outletId, accepts_orders } }
  })

  app.post<{ Params: { canteenId: string } }>('/v1/management/canteens/:canteenId/items', async (request, reply) => {
    const canteenId = z.string().uuid().parse(request.params.canteenId)
    const input = itemSchema.parse(request.body)
    const principal = requirePermission(request, 'catalog.manage', { canteenId })
    const item = await transaction(pool, async (client) => {
      const categoryCode = input.category.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'GENERAL'
      const category = await client.query<{ id: string }>(`
        INSERT INTO mealy.catalog_categories (canteen_id, code, name, status)
        VALUES ($1,$2,$3,'active') ON CONFLICT (canteen_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
        RETURNING id
      `, [canteenId, categoryCode, input.category])
      const menu = await client.query<{ id: string }>('SELECT id FROM mealy.menus WHERE canteen_id = $1 AND status = $2 AND archived_at IS NULL ORDER BY created_at LIMIT 1', [canteenId, 'active'])
      if (!menu.rows[0]) throw new AppError('ACTIVE_MENU_REQUIRED', 'Create or activate a menu before adding items.', 409)
      await client.query(`INSERT INTO mealy.menu_categories (menu_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [menu.rows[0].id, category.rows[0]!.id])
      const inserted = await client.query(`
        INSERT INTO mealy.catalog_items (canteen_id, primary_category_id, name, food_type, base_price_minor, preparation_minutes, status)
        VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *
      `, [canteenId, category.rows[0]!.id, input.name, input.food_type, input.price_minor, input.preparation_minutes])
      await client.query(`INSERT INTO mealy.catalog_item_categories (item_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [inserted.rows[0]!.id, category.rows[0]!.id])
      await client.query(`
        INSERT INTO mealy.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, canteen_id, after_data, request_id, ip_address, user_agent)
        VALUES ($1,'staff','catalog.item_created','catalog_item',$2,$3,$4,$5,$6,$7)
      `, [principal.userId, inserted.rows[0]!.id, canteenId, inserted.rows[0], request.id, request.ip, request.headers['user-agent'] ?? null])
      return inserted.rows[0]
    })
    return reply.status(201).send({ data: { item } })
  })

  app.post<{ Params: { canteenId: string } }>('/v1/management/canteens/:canteenId/staff', async (request, reply) => {
    const canteenId = z.string().uuid().parse(request.params.canteenId)
    const input = staffSchema.parse(request.body)
    const principal = requirePermission(request, 'staff.manage', { canteenId })
    const outletRole = ['outlet_manager', 'cashier', 'kitchen'].includes(input.role_code)
    if (outletRole && !input.outlet_id) throw new AppError('OUTLET_REQUIRED', 'Select an outlet for this role.', 400)
    if (input.outlet_id) {
      const scoped = await pool.query(`SELECT 1 FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE outlet.id = $1 AND link.canteen_id = $2`, [input.outlet_id, canteenId])
      if (!scoped.rows[0]) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found in this canteen.', 404)
    }
    const staff = await transaction(pool, async (client) => {
      const existing = await client.query('SELECT id FROM mealy.app_users WHERE lower(email) = lower($1) AND deleted_at IS NULL FOR UPDATE', [input.email])
      if (existing.rows[0]) throw new AppError('STAFF_EMAIL_EXISTS', 'This email already belongs to a Mealy account. Use an invitation flow to add an existing user.', 409)
      const user = await client.query<{ id: string }>(`
        INSERT INTO mealy.app_users (display_name, email, password_hash, status, email_verified_at)
        VALUES ($1,$2,$3,'active',now())
        ON CONFLICT ((lower(email))) WHERE email IS NOT NULL AND deleted_at IS NULL DO NOTHING
        RETURNING id
      `, [input.display_name, input.email, hashPassword(input.pin)])
      if (!user.rows[0]) throw new AppError('STAFF_EMAIL_EXISTS', 'This email already belongs to a Mealy account. Use an invitation flow to add an existing user.', 409)
      const scopeType = outletRole ? 'outlet' : 'canteen'
      const membership = await client.query<{ id: string }>(`
        INSERT INTO mealy.access_memberships (user_id, scope_type, canteen_id, outlet_id, employee_code, status, invited_by, starts_at)
        VALUES ($1,$2,$3,$4,$5,'active',$6,now()) RETURNING id
      `, [user.rows[0]!.id, scopeType, outletRole ? null : canteenId, input.outlet_id ?? null, input.employee_code, principal.userId])
      const role = await client.query<{ id: string }>('SELECT id FROM mealy.roles WHERE code = $1 AND scope_type = $2', [input.role_code, scopeType])
      if (!role.rows[0]) throw new AppError('ROLE_NOT_FOUND', 'The selected staff role is unavailable.', 409)
      await client.query('INSERT INTO mealy.membership_roles (membership_id, role_id, assigned_by) VALUES ($1,$2,$3)', [membership.rows[0]!.id, role.rows[0].id, principal.userId])
      await client.query(`
        INSERT INTO mealy.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, canteen_id, outlet_id, after_data, request_id, ip_address, user_agent)
        VALUES ($1,'staff','staff.created','app_user',$2,$3,$4,$5,$6,$7,$8)
      `, [principal.userId, user.rows[0]!.id, canteenId, input.outlet_id ?? null, { display_name: input.display_name, employee_code: input.employee_code, role_code: input.role_code }, request.id, request.ip, request.headers['user-agent'] ?? null])
      return { id: user.rows[0]!.id, display_name: input.display_name, employee_code: input.employee_code, role_code: input.role_code }
    })
    return reply.status(201).send({ data: { staff } })
  })

  app.post<{ Params: { canteenId: string; itemId: string } }>('/v1/management/canteens/:canteenId/items/:itemId/stock-adjustments', async (request, reply) => {
    const canteenId = z.string().uuid().parse(request.params.canteenId)
    const itemId = z.string().uuid().parse(request.params.itemId)
    const input = stockAdjustmentSchema.parse(request.body)
    const outlet = await pool.query<{ canteen_id: string }>(`
      SELECT link.canteen_id FROM mealy.outlets outlet
      JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
      WHERE outlet.id = $1 AND outlet.archived_at IS NULL
    `, [input.outlet_id])
    if (outlet.rows[0]?.canteen_id !== canteenId) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found in this canteen.', 404)
    const principal = requirePermission(request, 'inventory.manage', { canteenId, outletId: input.outlet_id })
    const idempotencyKey = requiredIdempotencyKey(request)
    const balance = await transaction(pool, async (client) => {
      await client.query('SELECT id FROM mealy.outlets WHERE id = $1 FOR UPDATE', [input.outlet_id])
      const scoped = await client.query<{ item_name: string }>(`
        SELECT item.name AS item_name FROM mealy.catalog_items item
        JOIN mealy.outlets outlet ON outlet.id = $3
        JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
        WHERE item.id = $2 AND item.canteen_id = $1 AND link.canteen_id = $1
          AND item.archived_at IS NULL AND outlet.archived_at IS NULL
      `, [canteenId, itemId, input.outlet_id])
      if (!scoped.rows[0]) throw new AppError('INVENTORY_SCOPE_INVALID', 'The item and outlet must belong to the selected canteen.', 404)
      const prior = await client.query<{ on_hand: string; reserved: string }>(`
        SELECT balance.on_hand, balance.reserved FROM mealy.inventory_movements movement
        JOIN mealy.inventory_balances balance ON balance.outlet_id = movement.outlet_id AND balance.inventory_item_id = movement.inventory_item_id
        WHERE movement.outlet_id = $1 AND movement.idempotency_key = $2
      `, [input.outlet_id, idempotencyKey])
      if (prior.rows[0]) return prior.rows[0]
      let inventory = await client.query<{ id: string }>(`
        SELECT inventory.id FROM mealy.recipes recipe
        JOIN mealy.inventory_items inventory ON inventory.id = recipe.inventory_item_id
        WHERE recipe.item_id = $1 AND recipe.variant_id IS NULL AND recipe.modifier_option_id IS NULL
        ORDER BY recipe.created_at LIMIT 1 FOR UPDATE OF inventory
      `, [itemId])
      if (!inventory.rows[0]) {
        inventory = await client.query<{ id: string }>(`
          INSERT INTO mealy.inventory_items (canteen_id, sku, name, unit, track_stock, low_stock_threshold, status)
          VALUES ($1,$2,$3,'unit',true,10,'active') RETURNING id
        `, [canteenId, `PORTION-${itemId}`, `${scoped.rows[0].item_name} portions`])
        await client.query('INSERT INTO mealy.recipes (item_id, inventory_item_id, quantity) VALUES ($1,$2,1)', [itemId, inventory.rows[0]!.id])
      }
      await client.query(`
        INSERT INTO mealy.inventory_balances (outlet_id, inventory_item_id, on_hand)
        VALUES ($1,$2,0) ON CONFLICT (outlet_id, inventory_item_id) DO NOTHING
      `, [input.outlet_id, inventory.rows[0]!.id])
      const updated = await client.query<{ on_hand: string; reserved: string }>(`
        UPDATE mealy.inventory_balances SET on_hand = on_hand + $3, version = version + 1, updated_at = now()
        WHERE outlet_id = $1 AND inventory_item_id = $2 AND on_hand + $3 >= reserved
        RETURNING on_hand, reserved
      `, [input.outlet_id, inventory.rows[0]!.id, input.quantity_delta])
      if (!updated.rows[0]) throw new AppError('INSUFFICIENT_STOCK', 'This adjustment would reduce stock below the reserved quantity.', 409)
      await client.query(`
        INSERT INTO mealy.inventory_movements (outlet_id, inventory_item_id, movement_type, quantity_delta, reference_type, reference_id, reason, performed_by, idempotency_key)
        VALUES ($1,$2,'adjustment',$3,'catalog_item',$4,$5,$6,$7)
      `, [input.outlet_id, inventory.rows[0]!.id, input.quantity_delta, itemId, input.reason, principal.userId, idempotencyKey])
      await client.query(`
        INSERT INTO mealy.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, canteen_id, outlet_id, after_data, request_id, ip_address, user_agent)
        VALUES ($1,'staff','inventory.adjusted','inventory_item',$2,$3,$4,$5,$6,$7,$8)
      `, [principal.userId, inventory.rows[0]!.id, canteenId, input.outlet_id, { item_id: itemId, quantity_delta: input.quantity_delta, reason: input.reason }, request.id, request.ip, request.headers['user-agent'] ?? null])
      return updated.rows[0]
    })
    return reply.status(201).send({ data: { item_id: itemId, outlet_id: input.outlet_id, balance } })
  })
}
