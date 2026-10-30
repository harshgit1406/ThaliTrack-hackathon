import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { requireOutletFeature } from '../entitlements.js'

async function readKot(pool: pg.Pool | pg.PoolClient, kotId: string) {
  const result = await pool.query<any>(`
    SELECT k.*, o.outlet_id, o.public_number, token.token_label,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', item.id, 'order_item_id', item.order_item_id, 'name', item.item_name_snapshot,
        'variant_name', item.variant_name_snapshot, 'quantity', item.quantity, 'status', item.status,
        'notes', item.notes_snapshot
      ) ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
    FROM mealy.kots k
    JOIN mealy.orders o ON o.id = k.order_id
    LEFT JOIN mealy.order_tokens token ON token.order_id = o.id AND token.voided_at IS NULL
    LEFT JOIN mealy.kot_items item ON item.kot_id = k.id
    WHERE k.id = $1 GROUP BY k.id, o.outlet_id, o.public_number, token.token_label
  `, [kotId])
  if (!result.rows[0]) throw new AppError('KOT_NOT_FOUND', 'Kitchen ticket was not found.', 404)
  return result.rows[0]
}

export async function registerKitchenRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get('/v1/kitchen/tickets', async (request) => {
    const query = z.object({ outlet_id: z.string().uuid(), station_id: z.string().uuid().optional() }).parse(request.query)
    await requireOutletFeature(pool, query.outlet_id, 'kot')
    await requireOutletPermission(pool, request, 'orders.read', query.outlet_id)
    const result = await pool.query<{ id: string }>(`
      SELECT k.id FROM mealy.kots k JOIN mealy.orders o ON o.id = k.order_id
      WHERE o.outlet_id = $1 AND ($2::uuid IS NULL OR k.kitchen_station_id = $2)
        AND k.status NOT IN ('served','cancelled') ORDER BY k.fired_at
    `, [query.outlet_id, query.station_id ?? null])
    return { data: { tickets: await Promise.all(result.rows.map((row) => readKot(pool, row.id))) } }
  })

  app.post<{ Params: { kotId: string } }>('/v1/kitchen/tickets/:kotId/start', async (request) => {
    const kotId = z.string().uuid().parse(request.params.kotId)
    const current = await readKot(pool, kotId)
    const principal = await requireOutletPermission(pool, request, 'kot.manage', current.outlet_id)
    if (!['queued', 'accepted'].includes(current.status)) throw new AppError('INVALID_KOT_TRANSITION', 'Only a queued ticket can start.', 409)
    await transaction(pool, async (client) => {
      await client.query("UPDATE mealy.kots SET status = 'preparing', accepted_at = COALESCE(accepted_at, now()) WHERE id = $1", [kotId])
      await client.query("UPDATE mealy.kot_items SET status = 'preparing', started_at = COALESCE(started_at, now()) WHERE kot_id = $1 AND status IN ('queued','accepted')", [kotId])
      await client.query(`INSERT INTO mealy.kot_status_events (kot_id, from_status, to_status, actor_user_id) VALUES ($1,$2,'preparing',$3)`, [kotId, current.status, principal.userId])
      await client.query(`INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('kot',$1,'kot.preparing',$2::jsonb)`, [kotId, JSON.stringify({ order_id: current.order_id })])
    })
    return { data: { ticket: await readKot(pool, kotId) } }
  })

  app.post<{ Params: { kotId: string; itemId: string } }>('/v1/kitchen/tickets/:kotId/items/:itemId/readiness', async (request) => {
    const kotId = z.string().uuid().parse(request.params.kotId)
    const itemId = z.string().uuid().parse(request.params.itemId)
    const { ready } = z.object({ ready: z.boolean() }).parse(request.body)
    const current = await readKot(pool, kotId)
    const principal = await requireOutletPermission(pool, request, 'kot.manage', current.outlet_id)
    if (current.status !== 'preparing') throw new AppError('INVALID_KOT_TRANSITION', 'Items can change only while preparing.', 409)
    const target = (current.items as Array<any>).find((item) => item.id === itemId)
    if (!target) throw new AppError('KOT_ITEM_NOT_FOUND', 'Kitchen ticket item was not found.', 404)
    const next = ready ? 'ready' : 'preparing'
    await transaction(pool, async (client) => {
      await client.query(`UPDATE mealy.kot_items SET status = $3, ready_at = CASE WHEN $3 = 'ready' THEN now() ELSE NULL END WHERE id = $1 AND kot_id = $2`, [itemId, kotId, next])
      await client.query(`UPDATE mealy.order_items oi SET preparation_status = $2 FROM mealy.kot_items ki WHERE ki.id = $1 AND oi.id = ki.order_item_id`, [itemId, next])
      await client.query(`INSERT INTO mealy.kot_status_events (kot_id, kot_item_id, from_status, to_status, actor_user_id) VALUES ($1,$2,$3,$4,$5)`, [kotId, itemId, target.status, next, principal.userId])
      await client.query(`INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('kot',$1,$2,$3::jsonb)`, [kotId, ready ? 'kot.item_ready' : 'kot.item_reopened', JSON.stringify({ item_id: itemId })])
    })
    return { data: { ticket: await readKot(pool, kotId) } }
  })

  app.post<{ Params: { kotId: string } }>('/v1/kitchen/tickets/:kotId/ready', async (request) => {
    const kotId = z.string().uuid().parse(request.params.kotId)
    const current = await readKot(pool, kotId)
    const principal = await requireOutletPermission(pool, request, 'kot.manage', current.outlet_id)
    if (current.status !== 'preparing') throw new AppError('INVALID_KOT_TRANSITION', 'Only a preparing ticket can become ready.', 409)
    if (!(current.items as Array<any>).every((item) => item.status === 'ready')) throw new AppError('KOT_ITEMS_NOT_READY', 'Every item must be ready first.', 409)
    await transaction(pool, async (client) => {
      await client.query("UPDATE mealy.kots SET status = 'ready', ready_at = now() WHERE id = $1", [kotId])
      await client.query(`INSERT INTO mealy.kot_status_events (kot_id, from_status, to_status, actor_user_id) VALUES ($1,'preparing','ready',$2)`, [kotId, principal.userId])
      await client.query(`SELECT mealy.transition_order($1,'ready_for_pickup','staff',$2,NULL,NULL,NULL)`, [current.order_id, principal.userId])
      await client.query(`INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('kot',$1,'kot.ready',$2::jsonb)`, [kotId, JSON.stringify({ order_id: current.order_id })])
    })
    return { data: { ticket: await readKot(pool, kotId) } }
  })
}
