import type { Queryable } from './database.js'
import { AppError } from './errors.js'

export async function readOrder(db: Queryable, orderId: string) {
  const orderResult = await db.query(`
    SELECT o.*, token.token_number, token.token_label,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'id', item.id, 'kot_item_id', kot_item.id, 'catalog_item_id', item.catalog_item_id, 'variant_id', item.variant_id,
             'name', item.item_name_snapshot, 'variant_name', item.variant_name_snapshot,
             'quantity', item.quantity, 'unit_price_minor', item.unit_price_minor,
             'modifier_total_minor', item.modifier_total_minor, 'line_total_minor', item.line_total_minor,
             'notes', item.notes, 'preparation_status', item.preparation_status
           )) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'id', kot.id, 'number', kot.kot_number, 'revision', kot.revision,
             'status', kot.status, 'station_id', kot.kitchen_station_id, 'fired_at', kot.fired_at
           )) FILTER (WHERE kot.id IS NOT NULL), '[]'::jsonb) AS kots
    FROM mealy.orders o
    LEFT JOIN mealy.order_tokens token ON token.order_id = o.id AND token.voided_at IS NULL
    LEFT JOIN mealy.order_items item ON item.order_id = o.id
    LEFT JOIN mealy.kots kot ON kot.order_id = o.id
    LEFT JOIN mealy.kot_items kot_item ON kot_item.kot_id = kot.id AND kot_item.order_item_id = item.id
    WHERE o.id = $1
    GROUP BY o.id, token.token_number, token.token_label
  `, [orderId])
  const order = orderResult.rows[0]
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order was not found.', 404)
  return order
}

export async function resolveOrderOutlet(db: Queryable, aggregateType: string, aggregateId: string): Promise<string | undefined> {
  if (aggregateType === 'order') {
    const result = await db.query<{ outlet_id: string }>('SELECT outlet_id FROM mealy.orders WHERE id = $1', [aggregateId])
    return result.rows[0]?.outlet_id
  }
  if (aggregateType === 'kot') {
    const result = await db.query<{ outlet_id: string }>(`
      SELECT o.outlet_id FROM mealy.kots k JOIN mealy.orders o ON o.id = k.order_id WHERE k.id = $1
    `, [aggregateId])
    return result.rows[0]?.outlet_id
  }
  return undefined
}
