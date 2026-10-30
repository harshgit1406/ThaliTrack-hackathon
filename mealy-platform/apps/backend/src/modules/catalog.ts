import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission } from '../auth.js'
import { AppError } from '../errors.js'

const paramsSchema = z.object({ outletId: z.string().uuid() })
const availabilityParamsSchema = z.object({ outletId: z.string().uuid(), itemId: z.string().uuid() })
const availabilitySchema = z.object({ is_available: z.boolean(), sold_out_until: z.string().datetime().nullable().optional() })

export async function registerCatalogRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get<{ Params: { outletId: string } }>('/v1/catalog/outlets/:outletId', async (request) => {
    const { outletId } = paramsSchema.parse(request.params)
    const outletResult = await pool.query<{
      id: string; name: string; currency_code: string; accepts_orders: boolean; preparation_lead_minutes: number; canteen_id: string; canteen_name: string; counter_id: string | null
    }>(`
      SELECT o.id, o.name, o.currency_code, o.accepts_orders, o.preparation_lead_minutes,
             c.id AS canteen_id, c.name AS canteen_name, counter.id AS counter_id
      FROM mealy.outlets o
      JOIN mealy.campus_canteens cc ON cc.id = o.campus_canteen_id
      JOIN mealy.canteens c ON c.id = cc.canteen_id
      LEFT JOIN LATERAL (SELECT id FROM mealy.service_counters WHERE outlet_id = o.id AND status = 'active' ORDER BY created_at LIMIT 1) counter ON true
      WHERE o.id = $1 AND o.status = 'active' AND o.archived_at IS NULL
    `, [outletId])
    const outlet = outletResult.rows[0]
    if (!outlet) throw new AppError('OUTLET_NOT_FOUND', 'Outlet was not found.', 404)

    const categories = await pool.query(`
      SELECT DISTINCT category.id, category.name, category.sort_order
      FROM mealy.catalog_categories category
      JOIN mealy.menu_categories mc ON mc.category_id = category.id
      JOIN mealy.menu_outlets mo ON mo.menu_id = mc.menu_id AND mo.outlet_id = $1 AND mo.is_active
      JOIN mealy.menus menu ON menu.id = mo.menu_id AND menu.status = 'active' AND menu.archived_at IS NULL
      WHERE category.canteen_id = $2 AND category.status = 'active' AND category.archived_at IS NULL
      ORDER BY category.sort_order, category.name
    `, [outletId, outlet.canteen_id])

    const items = await pool.query(`
      SELECT item.id, item.primary_category_id, item.name, item.short_description, item.food_type,
             COALESCE(settings.price_override_minor, item.base_price_minor) AS price_minor,
             item.currency_code, item.is_customizable,
             COALESCE(settings.preparation_minutes_override, item.preparation_minutes, $3) AS preparation_minutes,
             asset.public_url AS image_url,
             COALESCE(settings.is_available, true)
               AND (settings.sold_out_until IS NULL OR settings.sold_out_until <= now()) AS is_available,
             COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
               'id', variant.id, 'name', variant.name,
               'price_minor', COALESCE(variant_settings.price_override_minor, variant.price_minor),
               'is_default', variant.is_default,
               'is_available', COALESCE(variant_settings.is_available, true)
                 AND (variant_settings.sold_out_until IS NULL OR variant_settings.sold_out_until <= now())
             )) FILTER (WHERE variant.id IS NOT NULL), '[]'::jsonb) AS variants
      FROM mealy.catalog_items item
      JOIN mealy.menu_categories mc ON mc.category_id = item.primary_category_id
      JOIN mealy.menu_outlets mo ON mo.menu_id = mc.menu_id AND mo.outlet_id = $1 AND mo.is_active
      JOIN mealy.menus menu ON menu.id = mo.menu_id AND menu.status = 'active' AND menu.archived_at IS NULL
      LEFT JOIN mealy.outlet_item_settings settings ON settings.item_id = item.id AND settings.outlet_id = $1
      LEFT JOIN mealy.media_assets asset ON asset.id = item.image_asset_id AND asset.status = 'ready'
      LEFT JOIN mealy.item_variants variant ON variant.item_id = item.id AND variant.status = 'active' AND variant.archived_at IS NULL
      LEFT JOIN mealy.outlet_variant_settings variant_settings ON variant_settings.variant_id = variant.id AND variant_settings.outlet_id = $1
      WHERE item.canteen_id = $2 AND item.status = 'active' AND item.archived_at IS NULL
        AND COALESCE(settings.is_visible_student, true)
      GROUP BY item.id, settings.price_override_minor, settings.preparation_minutes_override, settings.is_available,
               settings.sold_out_until, asset.public_url
      ORDER BY item.sort_order, item.name
    `, [outletId, outlet.canteen_id, outlet.preparation_lead_minutes])

    return { data: { outlet, categories: categories.rows, items: items.rows }, meta: { generated_at: new Date().toISOString() } }
  })

  app.put<{ Params: { outletId: string; itemId: string } }>('/v1/catalog/outlets/:outletId/items/:itemId/availability', async (request) => {
    const { outletId, itemId } = availabilityParamsSchema.parse(request.params)
    const input = availabilitySchema.parse(request.body)
    await requireOutletPermission(pool, request, 'catalog.manage', outletId)
    const result = await pool.query(`
      INSERT INTO mealy.outlet_item_settings (outlet_id, item_id, is_available, sold_out_until, updated_at)
      SELECT $1, item.id, $3, $4, now()
      FROM mealy.catalog_items item
      JOIN mealy.outlets outlet ON outlet.id = $1
      JOIN mealy.campus_canteens assignment ON assignment.id = outlet.campus_canteen_id
      WHERE item.id = $2 AND item.canteen_id = assignment.canteen_id AND item.archived_at IS NULL
      ON CONFLICT (outlet_id, item_id) DO UPDATE SET
        is_available = EXCLUDED.is_available, sold_out_until = EXCLUDED.sold_out_until, updated_at = now()
      RETURNING outlet_id, item_id, is_available, sold_out_until, updated_at
    `, [outletId, itemId, input.is_available, input.sold_out_until ?? null])
    if (!result.rows[0]) throw new AppError('CATALOG_ITEM_NOT_FOUND', 'The item is not available for this outlet.', 404)
    return { data: { availability: result.rows[0] } }
  })
}
