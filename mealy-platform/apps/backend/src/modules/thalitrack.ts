import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { forecastDish, type DemandPoint } from '../forecast-model.js'

const outletParams = z.object({ outletId: z.string().uuid() })
const dateQuery = z.object({ date: z.string().date().optional() })
const leftoverSchema = z.object({
  catalog_item_id: z.string().uuid(), business_date: z.string().date(), leftover_kg: z.number().min(0).max(10_000),
  notes: z.string().trim().max(500).optional(),
})
const offerSchema = z.object({
  catalog_item_id: z.string().uuid(), quantity_available: z.number().int().min(1).max(999),
  discount_percent: z.number().int().min(1).max(90).default(30),
})

function isoDate(offsetDays = 0): string {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

async function ensureSlots(pool: pg.Pool, outletId: string, serviceDate: string): Promise<void> {
  await pool.query(`
    INSERT INTO mealy.pickup_slots (outlet_id, starts_at, ends_at, capacity)
    SELECT outlet.id,
      (($2::date + time '11:30') + step * interval '10 minutes') AT TIME ZONE outlet.timezone,
      (($2::date + time '11:40') + step * interval '10 minutes') AT TIME ZONE outlet.timezone,
      COALESCE(outlet.max_orders_per_slot, 30)
    FROM mealy.outlets outlet CROSS JOIN generate_series(0, 18) AS step
    WHERE outlet.id = $1 AND outlet.status = 'active' AND outlet.accepts_orders
    ON CONFLICT (outlet_id, starts_at) DO UPDATE SET capacity = EXCLUDED.capacity, updated_at = now()
  `, [outletId, serviceDate])
}

export async function registerThaliTrackRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get<{ Params: { outletId: string } }>('/v1/student/outlets/:outletId/pickup-slots', async (request) => {
    const { outletId } = outletParams.parse(request.params)
    const serviceDate = dateQuery.parse(request.query).date ?? isoDate()
    await ensureSlots(pool, outletId, serviceDate)
    const result = await pool.query(`
      SELECT slot.id, slot.starts_at, slot.ends_at, slot.capacity, slot.status,
        count(orders.id)::int AS order_count,
        GREATEST(0, slot.capacity - count(orders.id)::int) AS remaining_capacity
      FROM mealy.pickup_slots slot
      LEFT JOIN mealy.orders orders ON orders.pickup_slot_id = slot.id AND orders.status_code NOT IN ('cancelled','rejected')
      WHERE slot.outlet_id = $1 AND (slot.starts_at AT TIME ZONE (SELECT timezone FROM mealy.outlets WHERE id = $1))::date = $2::date
        AND slot.starts_at > now()
      GROUP BY slot.id ORDER BY slot.starts_at
    `, [outletId, serviceDate])
    return { data: { slots: result.rows, slot_minutes: 10 } }
  })

  app.get<{ Params: { outletId: string } }>('/v1/student/outlets/:outletId/queue-status', async (request) => {
    const { outletId } = outletParams.parse(request.params)
    const [summary, slots, rush] = await Promise.all([
      pool.query(`
        SELECT outlet.preparation_lead_minutes,
          count(orders.id) FILTER (WHERE orders.status_code IN ('placed','confirmed','preparing'))::int AS active_orders,
          count(orders.id) FILTER (WHERE orders.status_code = 'ready_for_pickup')::int AS ready_orders
        FROM mealy.outlets outlet LEFT JOIN mealy.orders orders ON orders.outlet_id = outlet.id AND orders.business_date = CURRENT_DATE
        WHERE outlet.id = $1 GROUP BY outlet.id
      `, [outletId]),
      pool.query(`
        SELECT slot.id, slot.starts_at, slot.ends_at, slot.capacity,
          count(orders.id) FILTER (WHERE orders.status_code NOT IN ('cancelled','rejected'))::int AS order_count
        FROM mealy.pickup_slots slot LEFT JOIN mealy.orders orders ON orders.pickup_slot_id = slot.id
        WHERE slot.outlet_id = $1 AND slot.ends_at > now() - interval '10 minutes' AND slot.starts_at < now() + interval '3 hours'
        GROUP BY slot.id ORDER BY slot.starts_at
      `, [outletId]),
      pool.query(`
        SELECT windows.label, windows.lecture_ends_at, windows.expected_multiplier
        FROM mealy.campus_rush_windows windows
        JOIN mealy.campuses campus ON campus.id = windows.campus_id
        JOIN mealy.campus_canteens link ON link.campus_id = campus.id
        JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id
        WHERE outlet.id = $1 AND windows.weekday = extract(dow FROM CURRENT_DATE) AND windows.is_active
        ORDER BY windows.lecture_ends_at
      `, [outletId]),
    ])
    const current = summary.rows[0]
    if (!current) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found.', 404)
    const active = Number(current.active_orders)
    const waitMinutes = Number(current.preparation_lead_minutes) + Math.ceil(active / 6) * 2
    return { data: { active_orders: active, ready_orders: Number(current.ready_orders), estimated_wait_minutes: waitMinutes, slots: slots.rows, rush_windows: rush.rows, generated_at: new Date().toISOString() } }
  })

  app.get<{ Params: { outletId: string } }>('/v1/student/outlets/:outletId/surplus-offers', async (request) => {
    const { outletId } = outletParams.parse(request.params)
    const result = await pool.query(`
      SELECT offer.id, offer.quantity_available, offer.discount_percent, offer.starts_at, offer.ends_at, offer.status,
        item.id AS item_id, item.name, item.base_price_minor,
        round(item.base_price_minor * (100 - offer.discount_percent) / 100.0)::bigint AS discounted_price_minor
      FROM mealy.surplus_offers offer JOIN mealy.catalog_items item ON item.id = offer.catalog_item_id
      WHERE offer.outlet_id = $1 AND offer.business_date = CURRENT_DATE AND offer.status = 'active' AND offer.ends_at > now()
      ORDER BY offer.starts_at, item.name
    `, [outletId])
    return { data: { offers: result.rows } }
  })

  app.get<{ Params: { outletId: string } }>('/v1/management/outlets/:outletId/rush-board', async (request) => {
    const { outletId } = outletParams.parse(request.params)
    await requireOutletPermission(pool, request, 'reports.read', outletId)
    await ensureSlots(pool, outletId, isoDate())
    const [orders, slots] = await Promise.all([
      pool.query(`
        SELECT orders.id, orders.public_number, orders.status_code, orders.placed_at, orders.total_minor,
          orders.customer_name_snapshot, token.token_label, slot.id AS pickup_slot_id, slot.starts_at, slot.ends_at,
          COALESCE(jsonb_agg(jsonb_build_object('name', item.item_name_snapshot, 'quantity', item.quantity)
            ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
        FROM mealy.orders orders
        LEFT JOIN mealy.order_tokens token ON token.order_id = orders.id AND token.voided_at IS NULL
        LEFT JOIN mealy.pickup_slots slot ON slot.id = orders.pickup_slot_id
        LEFT JOIN mealy.order_items item ON item.order_id = orders.id
        WHERE orders.outlet_id = $1 AND orders.business_date = CURRENT_DATE
          AND orders.status_code NOT IN ('collected','cancelled','rejected')
        GROUP BY orders.id, token.token_label, slot.id ORDER BY slot.starts_at NULLS LAST, orders.placed_at
      `, [outletId]),
      pool.query(`
        SELECT slot.id, slot.starts_at, slot.ends_at, slot.capacity,
          count(orders.id) FILTER (WHERE orders.status_code NOT IN ('cancelled','rejected'))::int AS order_count
        FROM mealy.pickup_slots slot LEFT JOIN mealy.orders orders ON orders.pickup_slot_id = slot.id
        WHERE slot.outlet_id = $1 AND slot.starts_at::date = CURRENT_DATE
        GROUP BY slot.id ORDER BY slot.starts_at
      `, [outletId]),
    ])
    return { data: { orders: orders.rows, slots: slots.rows, generated_at: new Date().toISOString() } }
  })

  app.get<{ Params: { outletId: string } }>('/v1/management/outlets/:outletId/forecast', async (request) => {
    const { outletId } = outletParams.parse(request.params)
    await requireOutletPermission(pool, request, 'reports.read', outletId)
    const targetDate = dateQuery.parse(request.query).date ?? isoDate(1)
    const [history, rush] = await Promise.all([
      pool.query(`
        SELECT history.catalog_item_id, item.name, history.service_date, history.quantity_ordered,
          history.leftover_kg, history.portion_weight_kg, history.lecture_rush_index
        FROM mealy.dish_demand_history history JOIN mealy.catalog_items item ON item.id = history.catalog_item_id
        WHERE history.outlet_id = $1 AND history.service_date < $2::date
        ORDER BY item.name, history.service_date
      `, [outletId, targetDate]),
      pool.query(`
        SELECT COALESCE(max(windows.expected_multiplier), 1) AS multiplier
        FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
        LEFT JOIN mealy.campus_rush_windows windows ON windows.campus_id = link.campus_id
          AND windows.weekday = extract(dow FROM $2::date) AND windows.is_active
        WHERE outlet.id = $1
      `, [outletId, targetDate]),
    ])
    const grouped = new Map<string, { name: string; points: DemandPoint[] }>()
    for (const row of history.rows) {
      const current = grouped.get(row.catalog_item_id) ?? { name: String(row.name), points: [] as DemandPoint[] }
      const serviceDate = row.service_date instanceof Date ? row.service_date.toISOString().slice(0, 10) : String(row.service_date).slice(0, 10)
      current.points.push({ serviceDate, quantityOrdered: Number(row.quantity_ordered), leftoverKg: Number(row.leftover_kg), portionWeightKg: Number(row.portion_weight_kg), rushIndex: Number(row.lecture_rush_index) })
      grouped.set(row.catalog_item_id, current)
    }
    const multiplier = Number(rush.rows[0]?.multiplier ?? 1)
    const dishes = [...grouped.entries()].filter(([, value]) => value.points.length >= 7).map(([catalogItemId, value]) => ({ catalog_item_id: catalogItemId, name: value.name, ...forecastDish(value.points.slice(-28), targetDate, multiplier), history: value.points.slice(-28) }))
    return { data: { target_date: targetDate, rush_multiplier: multiplier, dishes, estimated_food_saved_kg: Number(dishes.reduce((sum, dish) => sum + dish.estimatedFoodSavedKg, 0).toFixed(3)), model: 'ridge-regression-v1' } }
  })

  app.post<{ Params: { outletId: string } }>('/v1/management/outlets/:outletId/leftovers', async (request, reply) => {
    const { outletId } = outletParams.parse(request.params)
    const input = leftoverSchema.parse(request.body)
    const principal = await requireOutletPermission(pool, request, 'inventory.manage', outletId)
    const row = await transaction(pool, async (client) => {
      const item = await client.query(`SELECT 1 FROM mealy.catalog_items item JOIN mealy.outlets outlet ON outlet.id = $1 JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE item.id = $2 AND item.canteen_id = link.canteen_id`, [outletId, input.catalog_item_id])
      if (!item.rows[0]) throw new AppError('CATALOG_ITEM_NOT_FOUND', 'Dish was not found for this outlet.', 404)
      const saved = await client.query(`
        INSERT INTO mealy.leftover_logs (outlet_id, catalog_item_id, business_date, leftover_kg, notes, logged_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (outlet_id, catalog_item_id, business_date) DO UPDATE SET leftover_kg = EXCLUDED.leftover_kg, notes = EXCLUDED.notes, logged_by = EXCLUDED.logged_by, updated_at = now()
        RETURNING *
      `, [outletId, input.catalog_item_id, input.business_date, input.leftover_kg, input.notes ?? null, principal.userId])
      await client.query(`UPDATE mealy.dish_demand_history SET leftover_kg = $4, source = 'manager', updated_at = now() WHERE outlet_id = $1 AND catalog_item_id = $2 AND service_date = $3`, [outletId, input.catalog_item_id, input.business_date, input.leftover_kg])
      return saved.rows[0]
    })
    return reply.status(201).send({ data: { leftover: row } })
  })

  app.post<{ Params: { outletId: string } }>('/v1/management/outlets/:outletId/surplus-offers', async (request, reply) => {
    const { outletId } = outletParams.parse(request.params)
    const input = offerSchema.parse(request.body)
    const principal = await requireOutletPermission(pool, request, 'inventory.manage', outletId)
    const result = await pool.query(`
      INSERT INTO mealy.surplus_offers (outlet_id, catalog_item_id, business_date, quantity_available, discount_percent, starts_at, ends_at, created_by)
      SELECT $1,$2,CURRENT_DATE,$3,$4,
        (CURRENT_DATE + time '15:00') AT TIME ZONE outlet.timezone,
        (CURRENT_DATE + time '20:00') AT TIME ZONE outlet.timezone,$5
      FROM mealy.outlets outlet WHERE outlet.id = $1
      ON CONFLICT (outlet_id, catalog_item_id, business_date) DO UPDATE SET quantity_available = EXCLUDED.quantity_available,
        discount_percent = EXCLUDED.discount_percent, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = 'active', updated_at = now()
      RETURNING *
    `, [outletId, input.catalog_item_id, input.quantity_available, input.discount_percent, principal.userId])
    return reply.status(201).send({ data: { offer: result.rows[0] } })
  })
}
