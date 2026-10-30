import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission, requirePrincipal } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { requireOutletFeature } from '../entitlements.js'
import { readOrder } from '../order-read.js'
import { createQuote, quoteSchema } from './pricing.js'
import { requiredIdempotencyKey } from '../request-security.js'
import type { BackendConfig } from '../config.js'

const createOrderSchema = quoteSchema.extend({
  counter_id: z.string().uuid(),
  terminal_id: z.string().uuid().optional(),
  customer_name: z.string().trim().min(1).max(160).optional(),
  customer_phone: z.string().trim().max(20).optional(),
  customer_note: z.string().trim().max(2000).optional(),
  pickup_slot_id: z.string().uuid().optional(),
  payment_mode: z.literal('mock_upi').optional(),
})

const transitionSchema = z.object({
  to_status: z.string().trim().min(1).max(64),
  expected_version: z.number().int().nonnegative().optional(),
  reason_code: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
})

export async function registerOrderRoutes(app: FastifyInstance, pool: pg.Pool, config: BackendConfig): Promise<void> {
  app.post('/v1/orders', async (request, reply) => {
    const principal = requirePrincipal(request)
    const input = createOrderSchema.parse(request.body)
    const idempotencyKey = requiredIdempotencyKey(request)

    const sourceChannel = input.channel
    if (input.payment_mode === 'mock_upi' && !config.demoMode) throw new AppError('MOCK_PAYMENT_DISABLED', 'Payment simulation is available only in local demonstration mode.', 403)
    if (sourceChannel === 'student_web' && !input.pickup_slot_id) throw new AppError('PICKUP_SLOT_REQUIRED', 'Choose a pickup slot.', 422)
    const featureCode = sourceChannel === 'student_web' ? 'student_ordering' : sourceChannel === 'kiosk' ? 'qr_ordering' : 'pos'
    await requireOutletFeature(pool, input.outlet_id, featureCode)
    if (sourceChannel !== 'student_web') await requireOutletPermission(pool, request, 'orders.manage', input.outlet_id)
    if (input.terminal_id) {
      const terminal = await pool.query('SELECT 1 FROM mealy.pos_terminals WHERE id = $1 AND outlet_id = $2 AND status = $3', [input.terminal_id, input.outlet_id, 'active'])
      if (!terminal.rows[0]) throw new AppError('TERMINAL_SCOPE_INVALID', 'The POS terminal is not active for this outlet.', 400)
    }

    const order = await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order:${input.outlet_id}:${sourceChannel}:${idempotencyKey}`])
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM mealy.orders WHERE outlet_id = $1 AND source_channel = $2 AND idempotency_key = $3
      `, [input.outlet_id, sourceChannel, idempotencyKey])
      if (existing.rows[0]) return readOrder(client, existing.rows[0].id)

      let promisedAt: Date | null = null
      if (input.pickup_slot_id) {
        const slot = await client.query<{ ends_at: Date; capacity: number }>(`
          SELECT ends_at, capacity FROM mealy.pickup_slots
          WHERE id = $1 AND outlet_id = $2 AND status = 'open' AND starts_at > now() FOR UPDATE
        `, [input.pickup_slot_id, input.outlet_id])
        if (!slot.rows[0]) throw new AppError('PICKUP_SLOT_UNAVAILABLE', 'That pickup slot is no longer available.', 409)
        const used = await client.query<{ count: string }>(`
          SELECT count(*) FROM mealy.orders WHERE pickup_slot_id = $1 AND status_code NOT IN ('cancelled','rejected')
        `, [input.pickup_slot_id])
        if (Number(used.rows[0]?.count ?? 0) >= slot.rows[0].capacity) throw new AppError('PICKUP_SLOT_FULL', 'That pickup slot just filled up. Choose another slot.', 409)
        promisedAt = slot.rows[0].ends_at
      }
      const quote = await createQuote(client, input)
      const businessDate = new Date().toISOString().slice(0, 10)
      const sequence = await client.query<{ next_order_number: string }>(
        'SELECT mealy.next_order_number($1, $2::date)', [input.outlet_id, businessDate],
      )
      const orderNumber = Number(sequence.rows[0]!.next_order_number)
      const publicNumber = `${businessDate!.replaceAll('-', '')}-${orderNumber}`
      const studentUserId = sourceChannel === 'student_web' ? principal.userId : null
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO mealy.orders (
          public_number, outlet_id, counter_id, terminal_id, student_user_id, created_by_user_id,
          source_channel, fulfillment_type, status_code, business_date, order_number, currency_code,
          subtotal_minor, discount_total_minor, tax_total_minor, charge_total_minor, rounding_minor, total_minor,
          customer_name_snapshot, customer_phone_snapshot, customer_note, pricing_snapshot, idempotency_key,
          pickup_slot_id, promised_at, payment_status, paid_total_minor
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pickup','placed',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        RETURNING id
      `, [
        publicNumber, input.outlet_id, input.counter_id, input.terminal_id ?? null, studentUserId, principal.userId,
        sourceChannel, businessDate, orderNumber, quote.currency_code, quote.subtotal_minor,
        quote.discount_total_minor, quote.tax_total_minor, quote.charge_total_minor, quote.rounding_minor,
        quote.total_minor, input.customer_name ?? principal.displayName, input.customer_phone ?? principal.phone ?? null,
        input.customer_note ?? null, quote, idempotencyKey, input.pickup_slot_id ?? null, promisedAt,
        input.payment_mode === 'mock_upi' ? 'paid' : 'unpaid', input.payment_mode === 'mock_upi' ? quote.total_minor : 0,
      ])
      const orderId = inserted.rows[0]!.id

      const orderItemIds: string[] = []
      for (const line of quote.lines) {
        const item = await client.query<{ id: string }>(`
          INSERT INTO mealy.order_items (
            order_id, catalog_item_id, variant_id, sku_snapshot, item_name_snapshot, variant_name_snapshot,
            quantity, unit_price_minor, modifier_total_minor, discount_total_minor, tax_total_minor, line_total_minor, notes, preparation_status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,$11,'queued') RETURNING id
        `, [orderId, line.item_id, line.variant_id ?? null, line.sku ?? null, line.item_name, line.variant_name ?? null,
          line.quantity, line.unit_price_minor, line.modifier_total_minor, line.line_total_minor, line.notes ?? null])
        const orderItemId = item.rows[0]!.id
        orderItemIds.push(orderItemId)
        for (const modifier of line.modifiers as Array<Record<string, unknown>>) {
          await client.query(`
            INSERT INTO mealy.order_item_modifiers (
              order_item_id, modifier_group_id, modifier_option_id, group_name_snapshot,
              option_name_snapshot, quantity, unit_price_delta_minor, total_minor
            ) VALUES ($1,$2,$3,$4,$5,1,$6,$6)
          `, [orderItemId, modifier.group_id, modifier.id, modifier.group_name, modifier.name, modifier.price_delta_minor])
        }
      }

      await client.query('SELECT * FROM mealy.allocate_order_token($1,$2,$3::date)', [orderId, input.counter_id, businessDate])
      const station = await client.query<{ id: string }>(`
        SELECT id FROM mealy.kitchen_stations WHERE outlet_id = $1 AND status = 'active' ORDER BY display_order, created_at LIMIT 1
      `, [input.outlet_id])
      const kot = await client.query<{ id: string }>(`
        INSERT INTO mealy.kots (order_id, kitchen_station_id, kot_number, status, idempotency_key, created_by)
        VALUES ($1,$2,1,'queued',$3,$4) RETURNING id
      `, [orderId, station.rows[0]?.id ?? null, `order:${orderId}`, principal.userId])
      for (const orderItemId of orderItemIds) {
        await client.query(`
          INSERT INTO mealy.kot_items (kot_id, order_item_id, quantity, item_name_snapshot, variant_name_snapshot, notes_snapshot)
          SELECT $1, id, quantity, item_name_snapshot, variant_name_snapshot, notes FROM mealy.order_items WHERE id = $2
        `, [kot.rows[0]!.id, orderItemId])
      }
      await client.query(`
        INSERT INTO mealy.print_jobs (outlet_id, printer_id, order_id, kot_id, document_type, payload, idempotency_key)
        SELECT $1, route.printer_id, $2, $3, 'kot', $4::jsonb, $5
        FROM mealy.printer_routes route
        WHERE route.outlet_id = $1 AND route.document_type = 'kot' AND route.is_active
          AND (route.kitchen_station_id IS NULL OR route.kitchen_station_id = $6)
        ORDER BY route.priority LIMIT 1 ON CONFLICT (printer_id, idempotency_key) DO NOTHING
      `, [input.outlet_id, orderId, kot.rows[0]!.id, JSON.stringify({ order_id: orderId, kot_id: kot.rows[0]!.id }), `kot:${kot.rows[0]!.id}`, station.rows[0]?.id ?? null])
      return readOrder(client, orderId)
    })
    return reply.status(201).send({ data: { order } })
  })

  app.get<{ Params: { orderId: string } }>('/v1/orders/:orderId', async (request) => {
    const principal = requirePrincipal(request)
    const order = await readOrder(pool, z.string().uuid().parse(request.params.orderId))
    const ownsOrder = order.student_user_id === principal.userId
    if (!ownsOrder) await requireOutletPermission(pool, request, 'orders.read', order.outlet_id)
    return { data: { order } }
  })

  app.get('/v1/orders', async (request) => {
    const principal = requirePrincipal(request)
    const query = z.object({ outlet_id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query)
    if (query.outlet_id) await requireOutletPermission(pool, request, 'orders.read', query.outlet_id)
    const result = await pool.query(`
      SELECT orders.id, orders.public_number, orders.outlet_id, orders.source_channel, orders.status_code,
             orders.payment_status, orders.total_minor, orders.currency_code, orders.customer_name_snapshot,
             orders.placed_at, orders.promised_at, orders.ready_at, orders.version, token.token_label,
             slot.starts_at AS pickup_starts_at, slot.ends_at AS pickup_ends_at,
             COALESCE(jsonb_agg(jsonb_build_object(
               'id', item.id, 'name', item.item_name_snapshot, 'quantity', item.quantity
             ) ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
      FROM mealy.orders orders
      LEFT JOIN mealy.order_tokens token ON token.order_id = orders.id AND token.voided_at IS NULL
      LEFT JOIN mealy.pickup_slots slot ON slot.id = orders.pickup_slot_id
      LEFT JOIN mealy.order_items item ON item.order_id = orders.id
      WHERE ($1::uuid IS NOT NULL AND orders.outlet_id = $1)
         OR ($1::uuid IS NULL AND orders.student_user_id = $2)
      GROUP BY orders.id, token.token_label, slot.id
      ORDER BY orders.placed_at DESC LIMIT $3
    `, [query.outlet_id ?? null, principal.userId, query.limit])
    return { data: { orders: result.rows } }
  })

  app.post<{ Params: { orderId: string } }>('/v1/orders/:orderId/transitions', async (request) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const input = transitionSchema.parse(request.body)
    const current = await readOrder(pool, orderId)
    const principal = await requireOutletPermission(pool, request, 'orders.manage', current.outlet_id)
    try {
      const result = await pool.query(`SELECT transitioned.* FROM mealy.transition_order($1,$2,'staff',$3,$4,$5,$6) AS transitioned`, [
        orderId, input.to_status, principal.userId, input.reason_code ?? null, input.note ?? null, input.expected_version ?? null,
      ])
      return { data: { order: result.rows[0] } }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('version conflict')) throw new AppError('ORDER_VERSION_CONFLICT', 'The order changed; refresh and try again.', 409)
      if (message.includes('not allowed') || message.includes('reason is required')) throw new AppError('INVALID_ORDER_TRANSITION', message, 409)
      throw error
    }
  })
}
