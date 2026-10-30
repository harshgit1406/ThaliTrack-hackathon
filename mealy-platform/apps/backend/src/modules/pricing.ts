import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import type { Queryable } from '../database.js'
import { AppError } from '../errors.js'

export const quoteSchema = z.object({
  outlet_id: z.string().uuid(),
  channel: z.enum(['student_web', 'pos', 'admin', 'kiosk']).default('student_web'),
  items: z.array(z.object({
    item_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99),
    modifier_option_ids: z.array(z.string().uuid()).max(30).default([]),
    notes: z.string().trim().max(1000).optional(),
  })).min(1).max(100),
})

export type QuoteInput = z.infer<typeof quoteSchema>
export type Quote = Awaited<ReturnType<typeof createQuote>>

export async function createQuote(db: Queryable, input: QuoteInput) {
  const outlet = await db.query<{
    id: string; canteen_id: string; currency_code: string; accepts_orders: boolean
  }>(`
    SELECT o.id, cc.canteen_id, o.currency_code, o.accepts_orders
    FROM mealy.outlets o JOIN mealy.campus_canteens cc ON cc.id = o.campus_canteen_id
    WHERE o.id = $1 AND o.status = 'active' AND o.archived_at IS NULL
  `, [input.outlet_id])
  const outletRow = outlet.rows[0]
  if (!outletRow) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found.', 404)
  if (!outletRow.accepts_orders) throw new AppError('OUTLET_NOT_ACCEPTING_ORDERS', 'This outlet is not accepting orders.', 409)

  const lines = [] as Array<Record<string, unknown> & { line_total_minor: number }>
  for (const requested of input.items) {
    const itemResult = await db.query<{
      id: string; name: string; sku: string | null; base_price_minor: string; currency_code: string;
      variant_id: string | null; variant_name: string | null; variant_price_minor: string | null; is_available: boolean
    }>(`
      SELECT item.id, item.name, item.sku, item.base_price_minor, item.currency_code,
             variant.id AS variant_id, variant.name AS variant_name, variant.price_minor AS variant_price_minor,
             COALESCE(os.is_available, true) AND (os.sold_out_until IS NULL OR os.sold_out_until <= now())
               AND COALESCE(vs.is_available, true) AND (vs.sold_out_until IS NULL OR vs.sold_out_until <= now()) AS is_available
      FROM mealy.catalog_items item
      LEFT JOIN mealy.item_variants variant ON variant.id = $3 AND variant.item_id = item.id AND variant.status = 'active'
      LEFT JOIN mealy.outlet_item_settings os ON os.item_id = item.id AND os.outlet_id = $1
      LEFT JOIN mealy.outlet_variant_settings vs ON vs.variant_id = variant.id AND vs.outlet_id = $1
      WHERE item.id = $2 AND item.canteen_id = $4 AND item.status = 'active' AND item.archived_at IS NULL
    `, [input.outlet_id, requested.item_id, requested.variant_id ?? null, outletRow.canteen_id])
    const item = itemResult.rows[0]
    if (!item || (requested.variant_id && !item.variant_id)) throw new AppError('CATALOG_ITEM_NOT_FOUND', 'An item or variant was not found.', 404)
    if (!item.is_available) throw new AppError('ITEM_UNAVAILABLE', `${item.name} is currently unavailable.`, 409)

    const override = await db.query<{ price_minor: string }>(`
      SELECT price_minor FROM mealy.price_rules
      WHERE item_id = $1 AND (variant_id IS NULL OR variant_id = $2)
        AND (outlet_id IS NULL OR outlet_id = $3) AND (channel IS NULL OR channel = $4)
        AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY priority DESC, starts_at DESC LIMIT 1
    `, [requested.item_id, requested.variant_id ?? null, input.outlet_id, input.channel])
    const unitPrice = Number(override.rows[0]?.price_minor ?? item.variant_price_minor ?? item.base_price_minor)

    const modifiers = requested.modifier_option_ids.length === 0 ? { rows: [] } : await db.query<{
      id: string; group_id: string; group_name: string; name: string; price_delta_minor: string
    }>(`
      SELECT option.id, option.modifier_group_id AS group_id, groups.name AS group_name,
             option.name, option.price_delta_minor
      FROM mealy.modifier_options option
      JOIN mealy.modifier_groups groups ON groups.id = option.modifier_group_id
      JOIN mealy.item_modifier_groups assignment ON assignment.modifier_group_id = groups.id AND assignment.item_id = $1
        AND (assignment.variant_id IS NULL OR assignment.variant_id = $2)
      WHERE option.id = ANY($3::uuid[]) AND option.status = 'active' AND groups.status = 'active'
    `, [requested.item_id, requested.variant_id ?? null, requested.modifier_option_ids])
    if (modifiers.rows.length !== new Set(requested.modifier_option_ids).size) {
      throw new AppError('INVALID_MODIFIER', 'One or more modifiers are not available for this item.', 409)
    }
    const modifierTotal = modifiers.rows.reduce((sum, modifier) => sum + Number(modifier.price_delta_minor), 0)
    const lineTotal = (unitPrice + modifierTotal) * requested.quantity
    lines.push({
      item_id: item.id, item_name: item.name, sku: item.sku, variant_id: item.variant_id,
      variant_name: item.variant_name, quantity: requested.quantity, unit_price_minor: unitPrice,
      modifier_total_minor: modifierTotal, line_total_minor: lineTotal, notes: requested.notes,
      modifiers: modifiers.rows.map((modifier) => ({ ...modifier, price_delta_minor: Number(modifier.price_delta_minor) })),
    })
  }

  const subtotal = lines.reduce((sum, line) => sum + line.line_total_minor, 0)
  return {
    outlet_id: input.outlet_id,
    channel: input.channel,
    currency_code: outletRow.currency_code,
    subtotal_minor: subtotal,
    discount_total_minor: 0,
    tax_total_minor: 0,
    charge_total_minor: 0,
    rounding_minor: 0,
    total_minor: subtotal,
    lines,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  }
}

export async function registerPricingRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.post('/v1/pricing/quote', async (request) => ({ data: { quote: await createQuote(pool, quoteSchema.parse(request.body)) } }))
}
