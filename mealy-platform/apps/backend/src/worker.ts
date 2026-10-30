import { randomUUID } from 'node:crypto'
import { readConfig } from './config.js'
import { createPool, transaction } from './database.js'
import { readOrder, resolveOrderOutlet } from './order-read.js'
import { createQuote } from './modules/pricing.js'

const config = readConfig()
const pool = createPool(config)
let running = false

async function publishOutbox(): Promise<void> {
  await transaction(pool, async (client) => {
    const result = await client.query<{
      id: string; aggregate_type: string; aggregate_id: string; event_type: string; event_version: number;
      payload: Record<string, unknown>; occurred_at: Date
    }>(`
      SELECT * FROM mealy.outbox_events
      WHERE published_at IS NULL AND available_at <= now()
      ORDER BY occurred_at LIMIT 100 FOR UPDATE SKIP LOCKED
    `)
    for (const event of result.rows) {
      try {
        if (event.aggregate_type === 'order') {
          const paymentGate = await client.query<{ source_channel: string; payment_status: string }>(
            'SELECT source_channel, payment_status FROM mealy.orders WHERE id = $1',
            [event.aggregate_id],
          )
          const orderState = paymentGate.rows[0]
          if (orderState?.source_channel === 'pos' && !['paid', 'partially_refunded', 'refunded'].includes(orderState.payment_status)) {
            await client.query("UPDATE mealy.outbox_events SET available_at = now() + interval '5 seconds' WHERE id = $1", [event.id])
            continue
          }
        }
        const outletId = await resolveOrderOutlet(client, event.aggregate_type, event.aggregate_id)
        if (!outletId) throw new Error('No outlet route exists for this event')
        const canonical = event.aggregate_type === 'order'
          ? { order: await readOrder(client, event.aggregate_id) }
          : { ...event.payload }
        await client.query(`
          INSERT INTO mealy.cloud_gateway_events (
            event_id, outbox_event_id, outlet_id, event_type, aggregate_type, aggregate_id, payload, occurred_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (outbox_event_id) DO NOTHING
        `, [randomUUID(), event.id, outletId, event.event_type, event.aggregate_type, event.aggregate_id,
          { ...canonical, event_version: event.event_version }, event.occurred_at])
        await client.query('UPDATE mealy.outbox_events SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1', [event.id])
      } catch (error) {
        await client.query(`
          UPDATE mealy.outbox_events SET attempts = attempts + 1, last_error = $2,
            available_at = now() + make_interval(secs => LEAST(60, power(2, LEAST(attempts + 1, 6))::int))
          WHERE id = $1
        `, [event.id, error instanceof Error ? error.message.slice(0, 500) : 'Unknown publication failure'])
      }
    }
  })
}

async function reconcileGatewayEvents(): Promise<void> {
  await transaction(pool, async (client) => {
    const events = await client.query<any>(`
      SELECT ingest.*, gateway.outlet_id
      FROM mealy.gateway_ingest_events ingest
      JOIN mealy.outlet_gateways gateway ON gateway.id = ingest.gateway_id
      WHERE ingest.status IN ('received','failed') ORDER BY ingest.received_at
      LIMIT 100 FOR UPDATE OF ingest SKIP LOCKED
    `)
    for (const event of events.rows) {
      try {
        const ticket = event.payload?.ticket
        if (event.event_type === 'ticket.created') {
          const commercial = event.payload?.commercial
          if (!ticket?.id || !ticket?.orderId || !commercial?.counterId || !commercial?.terminalId || !commercial?.shiftId || !commercial?.staffUserId || !commercial?.paymentMethodConfigId || !Array.isArray(commercial?.items)) {
            throw new Error('Offline order is missing its commercial reconciliation snapshot')
          }
          const existingOrder = await client.query('SELECT id FROM mealy.orders WHERE id = $1', [ticket.orderId])
          if (existingOrder.rows[0]) {
            await client.query(`UPDATE mealy.gateway_ingest_events SET status = 'processed', processed_at = now(), last_error = NULL WHERE gateway_id = $1 AND event_id = $2`, [event.gateway_id, event.event_id])
            continue
          }
          const quote = await createQuote(client, {
            outlet_id: event.outlet_id,
            channel: 'pos',
            items: commercial.items.map((item: any) => ({ item_id: item.catalogItemId, variant_id: item.variantId ?? undefined, quantity: item.quantity, modifier_option_ids: [], notes: item.note ?? undefined })),
          })
          if (quote.total_minor !== Number(commercial.totalMinor) || quote.subtotal_minor !== Number(commercial.subtotalMinor)) {
            throw new Error('Offline order price changed before reconciliation; manager review is required')
          }
          for (const [index, line] of quote.lines.entries()) {
            if (Number(line.unit_price_minor) !== Number(commercial.items[index]?.unitPriceMinor)) throw new Error('Offline item price snapshot does not match the authoritative catalog')
          }
          const tokenNumber = Number(commercial.tokenNumber)
          const tokenBlock = await client.query<any>(`
            SELECT block.* FROM mealy.gateway_token_blocks block
            WHERE block.gateway_id = $1 AND block.counter_id = $2 AND block.service_date = $3::date
              AND $4 BETWEEN block.range_start AND block.range_end AND block.status <> 'revoked'
            FOR UPDATE
          `, [event.gateway_id, commercial.counterId, ticket.receivedAt.slice(0, 10), tokenNumber])
          if (!tokenBlock.rows[0]) throw new Error('Offline token is outside a valid reserved block')
          const context = await client.query(`
            SELECT terminal.id FROM mealy.pos_terminals terminal
            JOIN mealy.pos_shifts shift ON shift.id = $3 AND shift.status IN ('open','closing')
            JOIN mealy.cash_registers register ON register.id = shift.cash_register_id AND register.outlet_id = $1
            JOIN mealy.access_memberships membership ON membership.user_id = $4 AND membership.status = 'active'
            WHERE terminal.id = $2 AND terminal.outlet_id = $1 AND terminal.status = 'active'
              AND (membership.outlet_id = $1 OR membership.canteen_id = (SELECT link.canteen_id FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id WHERE outlet.id = $1))
          `, [event.outlet_id, commercial.terminalId, commercial.shiftId, commercial.staffUserId])
          if (!context.rows[0]) throw new Error('Offline staff, shift, or terminal context is no longer valid')
          const method = await client.query<any>(`
            SELECT config.* FROM mealy.payment_method_configs config
            JOIN mealy.campus_canteens link ON link.canteen_id = config.canteen_id
            JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id
            WHERE config.id = $1 AND outlet.id = $2 AND config.method_code = 'cash' AND config.is_enabled AND 'pos' = ANY(config.accepted_channels)
          `, [commercial.paymentMethodConfigId, event.outlet_id])
          if (!method.rows[0]) throw new Error('Offline cash payment configuration is unavailable')

          const businessDate = ticket.receivedAt.slice(0, 10)
          const sequence = await client.query<{ next_order_number: string }>('SELECT mealy.next_order_number($1,$2::date)', [event.outlet_id, businessDate])
          const orderNumber = Number(sequence.rows[0]!.next_order_number)
          const publicNumber = `${businessDate.replaceAll('-', '')}-${orderNumber}`
          await client.query(`
            INSERT INTO mealy.orders (id, public_number, outlet_id, counter_id, terminal_id, created_by_user_id, source_channel,
              fulfillment_type, status_code, payment_status, business_date, order_number, currency_code, subtotal_minor,
              discount_total_minor, tax_total_minor, charge_total_minor, rounding_minor, total_minor, paid_total_minor,
              customer_name_snapshot, customer_note, pricing_snapshot, idempotency_key, pos_shift_id, placed_at)
            VALUES ($1,$2,$3,$4,$5,$6,'pos','pickup','placed','paid',$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,
              'Counter customer',$16,$17,$18,$19,$20)
          `, [ticket.orderId, publicNumber, event.outlet_id, commercial.counterId, commercial.terminalId, commercial.staffUserId,
            businessDate, orderNumber, quote.currency_code, quote.subtotal_minor, quote.discount_total_minor, quote.tax_total_minor,
            quote.charge_total_minor, quote.rounding_minor, quote.total_minor, ticket.customerNote ?? null, quote,
            `gateway:${event.gateway_id}:${event.event_id}`, commercial.shiftId, ticket.receivedAt])
          await client.query(`
            INSERT INTO mealy.order_tokens (order_id, counter_id, service_date, token_number, token_label)
            VALUES ($1,$2,$3,$4,$5)
          `, [ticket.orderId, commercial.counterId, businessDate, tokenNumber, ticket.token])
          const station = await client.query<{ id: string }>('SELECT id FROM mealy.kitchen_stations WHERE outlet_id = $1 AND status = $2 ORDER BY display_order LIMIT 1', [event.outlet_id, 'active'])
          await client.query(`INSERT INTO mealy.kots (id, order_id, kitchen_station_id, kot_number, status, idempotency_key, created_by) VALUES ($1,$2,$3,1,'queued',$4,$5)`, [ticket.id, ticket.orderId, station.rows[0]?.id ?? null, `gateway:${event.event_id}`, commercial.staffUserId])
          for (const [index, line] of quote.lines.entries()) {
            const orderItemId = randomUUID()
            await client.query(`
              INSERT INTO mealy.order_items (id, order_id, catalog_item_id, variant_id, sku_snapshot, item_name_snapshot,
                variant_name_snapshot, quantity, unit_price_minor, modifier_total_minor, line_total_minor, notes, preparation_status)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'queued')
            `, [orderItemId, ticket.orderId, line.item_id, line.variant_id ?? null, line.sku ?? null, line.item_name,
              line.variant_name ?? null, line.quantity, line.unit_price_minor, line.modifier_total_minor, line.line_total_minor, line.notes ?? null])
            await client.query(`
              INSERT INTO mealy.kot_items (id, kot_id, order_item_id, quantity, item_name_snapshot, variant_name_snapshot, notes_snapshot)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
            `, [commercial.items[index].ticketItemId, ticket.id, orderItemId, line.quantity, line.item_name, line.variant_name ?? null, line.notes ?? null])
          }
          const intent = await client.query<{ id: string }>(`
            INSERT INTO mealy.payment_intents (order_id, payment_method_config_id, idempotency_key, amount_minor, currency_code, status, metadata)
            VALUES ($1,$2,$3,$4,$5,'captured',$6::jsonb) RETURNING id
          `, [ticket.orderId, commercial.paymentMethodConfigId, `gateway:${event.event_id}`, quote.total_minor, quote.currency_code, JSON.stringify({ offline_gateway_event: event.event_id })])
          await client.query(`INSERT INTO mealy.payment_transactions (payment_intent_id, transaction_type, provider_transaction_id, amount_minor, currency_code, status, processed_at) VALUES ($1,'sale',$2,$3,$4,'succeeded',now())`, [intent.rows[0]!.id, `cash:gateway:${event.event_id}`, quote.total_minor, quote.currency_code])
          await client.query(`INSERT INTO mealy.cash_movements (shift_id, order_id, movement_type, amount_minor, currency_code, reason, performed_by, idempotency_key) VALUES ($1,$2,'sale',$3,$4,'Offline counter sale',$5,$6)`, [commercial.shiftId, ticket.orderId, quote.total_minor, quote.currency_code, commercial.staffUserId, `gateway:${event.event_id}`])
          await client.query(`UPDATE mealy.gateway_token_blocks SET next_value = GREATEST(next_value, $2 + 1), status = CASE WHEN $2 >= range_end THEN 'exhausted' ELSE status END, updated_at = now() WHERE id = $1`, [tokenBlock.rows[0].id, tokenNumber])
          await client.query(`UPDATE mealy.gateway_ingest_events SET status = 'processed', processed_at = now(), last_error = NULL WHERE gateway_id = $1 AND event_id = $2`, [event.gateway_id, event.event_id])
          continue
        }
        if (!ticket?.id) throw new Error('Ticket snapshot is required')
        const kot = await client.query<{ id: string; order_id: string; outlet_id: string }>(`
          SELECT k.id, k.order_id, o.outlet_id FROM mealy.kots k JOIN mealy.orders o ON o.id = k.order_id WHERE k.id = $1
        `, [ticket.id])
        if (!kot.rows[0] || kot.rows[0].outlet_id !== event.outlet_id) throw new Error('Ticket is not assigned to this gateway outlet')
        const nextKotStatus = ticket.status === 'new' ? 'queued' : ticket.status
        await client.query(`UPDATE mealy.kots SET status = $2, ready_at = CASE WHEN $2 = 'ready' THEN now() ELSE ready_at END WHERE id = $1`, [ticket.id, nextKotStatus])
        if (event.event_type === 'ticket.delayed') {
          const minutes = Number(event.payload.minutes)
          if (Number.isInteger(minutes) && minutes > 0 && minutes <= 60) {
            await client.query("UPDATE mealy.orders SET promised_at = COALESCE(promised_at, placed_at) + ($2 * interval '1 minute'), updated_at = now() WHERE id = $1", [kot.rows[0].order_id, minutes])
          }
        }
        for (const item of ticket.items ?? []) {
          await client.query(`
            UPDATE mealy.kot_items SET status = $3, ready_at = CASE WHEN $3 = 'ready' THEN now() ELSE NULL END
            WHERE id = $1 AND kot_id = $2
          `, [item.id, ticket.id, item.status === 'ready' ? 'ready' : 'preparing'])
        }
        const orderState = await client.query<{ status_code: string }>('SELECT status_code FROM mealy.orders WHERE id = $1 FOR UPDATE', [kot.rows[0].order_id])
        let status = orderState.rows[0]?.status_code
        if (ticket.status === 'preparing') {
          if (status === 'ready_for_pickup') {
            await client.query("SELECT mealy.transition_order($1,'preparing','system',NULL,'Kitchen remake requested',NULL,NULL)", [kot.rows[0].order_id])
            status = 'preparing'
          }
          if (status === 'placed') {
            await client.query("SELECT mealy.transition_order($1,'confirmed','system',NULL,NULL,NULL,NULL)", [kot.rows[0].order_id])
            status = 'confirmed'
          }
          if (status === 'confirmed') await client.query("SELECT mealy.transition_order($1,'preparing','system',NULL,NULL,NULL,NULL)", [kot.rows[0].order_id])
        }
        if (ticket.status === 'ready') {
          if (status === 'placed') {
            await client.query("SELECT mealy.transition_order($1,'confirmed','system',NULL,NULL,NULL,NULL)", [kot.rows[0].order_id])
            status = 'confirmed'
          }
          if (status === 'confirmed') {
            await client.query("SELECT mealy.transition_order($1,'preparing','system',NULL,NULL,NULL,NULL)", [kot.rows[0].order_id])
            status = 'preparing'
          }
          if (status === 'preparing') await client.query("SELECT mealy.transition_order($1,'ready_for_pickup','system',NULL,NULL,NULL,NULL)", [kot.rows[0].order_id])
        }
        await client.query(`UPDATE mealy.gateway_ingest_events SET status = 'processed', processed_at = now(), last_error = NULL WHERE gateway_id = $1 AND event_id = $2`, [event.gateway_id, event.event_id])
      } catch (error) {
        await client.query(`UPDATE mealy.gateway_ingest_events SET status = 'failed', last_error = $3 WHERE gateway_id = $1 AND event_id = $2`, [event.gateway_id, event.event_id, error instanceof Error ? error.message.slice(0, 500) : 'Unknown reconciliation failure'])
      }
    }
  })
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    await publishOutbox()
    await reconcileGatewayEvents()
  } finally {
    running = false
  }
}

const timer = setInterval(() => void tick().catch((error) => console.error('Worker tick failed', error)), config.workerIntervalMs)
timer.unref()
await tick()

const shutdown = async () => {
  clearInterval(timer)
  await pool.end()
}
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

await new Promise(() => undefined)
