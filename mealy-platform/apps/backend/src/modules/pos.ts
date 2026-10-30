import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission, requirePrincipal } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { readOrder } from '../order-read.js'
import { requiredIdempotencyKey } from '../request-security.js'

const contextSchema = z.object({
  outlet_id: z.string().uuid(),
  terminal_id: z.string().uuid(),
})

const openShiftSchema = z.object({
  cash_register_id: z.string().uuid(),
  opening_cash_minor: z.number().int().nonnegative(),
  opening_note: z.string().trim().max(500).optional(),
})

const closeShiftSchema = z.object({
  counted_closing_cash_minor: z.number().int().nonnegative(),
  closing_note: z.string().trim().max(500).optional(),
})

const settlementSchema = z.object({
  shift_id: z.string().uuid().optional(),
  tenders: z.array(z.object({
    payment_method_config_id: z.string().uuid(),
    amount_minor: z.number().int().positive(),
    reference: z.string().trim().min(1).max(160).optional(),
  })).min(1).max(5),
  issue_receipt: z.boolean().default(true),
})

const refundSchema = z.object({
  reason_code: z.enum(['customer_request', 'order_cancelled', 'quality_issue']),
  note: z.string().trim().min(3).max(500),
  external_reference: z.string().trim().min(1).max(160).optional(),
})

function financialYear(now = new Date()): string {
  const year = now.getUTCFullYear()
  const starts = now.getUTCMonth() >= 3 ? year : year - 1
  return `${starts}-${String(starts + 1).slice(-2)}`
}

export async function registerPosRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get('/v1/pos/context', async (request) => {
    const query = contextSchema.parse(request.query)
    const result = await pool.query(`
      SELECT terminal.id AS terminal_id, terminal.name AS terminal_name, terminal.status AS terminal_status,
             counter.id AS counter_id, counter.name AS counter_name,
             outlet.id AS outlet_id, outlet.name AS outlet_name, outlet.currency_code,
             link.canteen_id, canteen.name AS canteen_name
      FROM mealy.pos_terminals terminal
      JOIN mealy.outlets outlet ON outlet.id = terminal.outlet_id
      JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
      JOIN mealy.canteens canteen ON canteen.id = link.canteen_id
      LEFT JOIN mealy.service_counters counter ON counter.id = terminal.counter_id
      WHERE terminal.id = $1 AND outlet.id = $2 AND terminal.status = 'active'
    `, [query.terminal_id, query.outlet_id])
    const context = result.rows[0]
    if (!context) throw new AppError('POS_CONTEXT_NOT_FOUND', 'The configured POS terminal is not active for this outlet.', 404)
    const principal = await requireOutletPermission(pool, request, 'pos.use', query.outlet_id)
    const [methods, registers, shift] = await Promise.all([
      pool.query(`
        SELECT config.id, config.method_code, config.display_name, config.provider, config.public_configuration
        FROM mealy.payment_method_configs config
        WHERE config.canteen_id = $1 AND config.is_enabled AND 'pos' = ANY(config.accepted_channels)
          AND (config.outlet_id IS NULL OR config.outlet_id = $2)
        ORDER BY config.sort_order, config.display_name
      `, [context.canteen_id, query.outlet_id]),
      pool.query(`SELECT id, code, name FROM mealy.cash_registers WHERE outlet_id = $1 AND status = 'active' AND (terminal_id IS NULL OR terminal_id = $2) ORDER BY name`, [query.outlet_id, query.terminal_id]),
      pool.query(`
        SELECT shift.* FROM mealy.pos_shifts shift
        JOIN mealy.cash_registers register ON register.id = shift.cash_register_id
        WHERE register.outlet_id = $1 AND (register.terminal_id IS NULL OR register.terminal_id = $2)
          AND shift.status IN ('open','closing') ORDER BY shift.opened_at DESC LIMIT 1
      `, [query.outlet_id, query.terminal_id]),
    ])
    await pool.query('UPDATE mealy.pos_terminals SET last_seen_at = now(), updated_at = now() WHERE id = $1', [query.terminal_id])
    return { data: { context, user: { id: principal.userId, display_name: principal.displayName }, payment_methods: methods.rows, cash_registers: registers.rows, open_shift: shift.rows[0] ?? null } }
  })

  app.post('/v1/pos/shifts', async (request, reply) => {
    const input = openShiftSchema.parse(request.body)
    const principal = requirePrincipal(request)
    const register = await pool.query<{ outlet_id: string; currency_code: string }>(`
      SELECT register.outlet_id, outlet.currency_code FROM mealy.cash_registers register
      JOIN mealy.outlets outlet ON outlet.id = register.outlet_id
      WHERE register.id = $1 AND register.status = 'active'
    `, [input.cash_register_id])
    const target = register.rows[0]
    if (!target) throw new AppError('CASH_REGISTER_NOT_FOUND', 'Cash register was not found.', 404)
    await requireOutletPermission(pool, request, 'pos.use', target.outlet_id)
    try {
      const shift = await transaction(pool, async (client) => {
        const opened = await client.query(`
          INSERT INTO mealy.pos_shifts (cash_register_id, opened_by, opening_cash_minor, currency_code, opening_note)
          VALUES ($1,$2,$3,$4,$5) RETURNING *
        `, [input.cash_register_id, principal.userId, input.opening_cash_minor, target.currency_code, input.opening_note ?? null])
        if (input.opening_cash_minor > 0) {
          await client.query(`
            INSERT INTO mealy.cash_movements (shift_id, movement_type, amount_minor, currency_code, reason, performed_by, idempotency_key)
            VALUES ($1,'opening',$2,$3,$4,$5,$6)
          `, [opened.rows[0]!.id, input.opening_cash_minor, target.currency_code, input.opening_note ?? 'Opening float', principal.userId, `opening:${opened.rows[0]!.id}`])
        }
        return opened.rows[0]
      })
      return reply.status(201).send({ data: { shift } })
    } catch (error) {
      if (error instanceof Error && error.message.includes('pos_shifts_one_open_uidx')) throw new AppError('SHIFT_ALREADY_OPEN', 'This register already has an open shift.', 409)
      throw error
    }
  })

  app.post<{ Params: { shiftId: string } }>('/v1/pos/shifts/:shiftId/close', async (request) => {
    const shiftId = z.string().uuid().parse(request.params.shiftId)
    const input = closeShiftSchema.parse(request.body)
    const principal = requirePrincipal(request)
    const result = await transaction(pool, async (client) => {
      const current = await client.query<any>(`
        SELECT shift.*, register.outlet_id FROM mealy.pos_shifts shift
        JOIN mealy.cash_registers register ON register.id = shift.cash_register_id
        WHERE shift.id = $1 FOR UPDATE
      `, [shiftId])
      const shift = current.rows[0]
      if (!shift) throw new AppError('SHIFT_NOT_FOUND', 'Shift was not found.', 404)
      await requireOutletPermission(client, request, 'pos.use', shift.outlet_id)
      if (shift.status !== 'open') throw new AppError('SHIFT_NOT_OPEN', 'Only an open shift can be closed.', 409)
      const totals = await client.query<{ expected: string }>(`
        SELECT ($2::bigint + COALESCE(sum(CASE WHEN movement_type IN ('opening','closing_adjustment') THEN 0 ELSE amount_minor END),0))::text AS expected
        FROM mealy.cash_movements WHERE shift_id = $1
      `, [shiftId, shift.opening_cash_minor])
      const expected = Number(totals.rows[0]?.expected ?? shift.opening_cash_minor)
      const closed = await client.query(`
        UPDATE mealy.pos_shifts SET status = 'closed', closed_by = $2, closed_at = now(),
          expected_closing_cash_minor = $3, counted_closing_cash_minor = $4, variance_minor = $4 - $3,
          closing_note = $5, updated_at = now() WHERE id = $1 RETURNING *
      `, [shiftId, principal.userId, expected, input.counted_closing_cash_minor, input.closing_note ?? null])
      return closed.rows[0]
    })
    return { data: { shift: result } }
  })

  app.post<{ Params: { orderId: string } }>('/v1/pos/orders/:orderId/settle', async (request) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const input = settlementSchema.parse(request.body)
    const principal = requirePrincipal(request)
    const idempotencyKey = requiredIdempotencyKey(request)
    const settled = await transaction(pool, async (client) => {
      await client.query('SELECT id FROM mealy.orders WHERE id = $1 FOR UPDATE', [orderId])
      const order = await readOrder(client, orderId)
      await requireOutletPermission(client, request, 'payments.capture_pos', order.outlet_id)
      const prior = await client.query('SELECT id FROM mealy.payment_intents WHERE order_id = $1 AND idempotency_key = $2', [orderId, `${idempotencyKey}:0`])
      if (prior.rows[0]) {
        const receipt = await client.query('SELECT * FROM mealy.receipts WHERE order_id = $1 AND voided_at IS NULL ORDER BY issued_at DESC LIMIT 1', [orderId])
        return { order, receipt: receipt.rows[0] ?? null }
      }
      if (order.source_channel !== 'pos') throw new AppError('POS_SETTLEMENT_NOT_ALLOWED', 'Only counter POS orders can use this settlement route.', 409)
      const remaining = Number(order.total_minor) - Number(order.paid_total_minor)
      const tenderTotal = input.tenders.reduce((sum, tender) => sum + tender.amount_minor, 0)
      if (tenderTotal !== remaining) throw new AppError('PAYMENT_AMOUNT_MISMATCH', `Tender total must equal the remaining amount of ${remaining}.`, 409)

      const methods = await client.query<any>(`
        SELECT config.* FROM mealy.payment_method_configs config
        JOIN mealy.campus_canteens link ON link.canteen_id = config.canteen_id
        JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id
        WHERE outlet.id = $1 AND config.id = ANY($2::uuid[]) AND config.is_enabled
          AND 'pos' = ANY(config.accepted_channels) AND (config.outlet_id IS NULL OR config.outlet_id = $1)
      `, [order.outlet_id, input.tenders.map((tender) => tender.payment_method_config_id)])
      const methodMap = new Map(methods.rows.map((method: any) => [method.id, method]))
      if (methodMap.size !== new Set(input.tenders.map((tender) => tender.payment_method_config_id)).size) {
        throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 'One or more payment methods are unavailable for this outlet.', 409)
      }

      for (const [index, tender] of input.tenders.entries()) {
        const method: any = methodMap.get(tender.payment_method_config_id)
        if (method.method_code !== 'cash' && !tender.reference) throw new AppError('PAYMENT_REFERENCE_REQUIRED', `${method.display_name} requires a transaction reference.`, 409)
        if (method.method_code === 'cash') {
          if (!input.shift_id) throw new AppError('OPEN_SHIFT_REQUIRED', 'Open a cash shift before accepting cash.', 409)
          const shift = await client.query(`
            SELECT shift.id FROM mealy.pos_shifts shift JOIN mealy.cash_registers register ON register.id = shift.cash_register_id
            WHERE shift.id = $1 AND register.outlet_id = $2 AND shift.status = 'open' FOR UPDATE
          `, [input.shift_id, order.outlet_id])
          if (!shift.rows[0]) throw new AppError('OPEN_SHIFT_REQUIRED', 'The selected cash shift is not open for this outlet.', 409)
        }
        const intent = await client.query<{ id: string }>(`
          INSERT INTO mealy.payment_intents (order_id, payment_method_config_id, provider, idempotency_key, amount_minor, currency_code, status, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,'captured',$7::jsonb)
          ON CONFLICT (order_id, idempotency_key) DO UPDATE SET updated_at = now() RETURNING id
        `, [orderId, method.id, method.provider, `${idempotencyKey}:${index}`, tender.amount_minor, order.currency_code, JSON.stringify({ pos_reference: tender.reference ?? null })])
        await client.query(`
          INSERT INTO mealy.payment_transactions (payment_intent_id, transaction_type, provider_transaction_id, amount_minor, currency_code, status, processed_at)
          VALUES ($1,'sale',$2,$3,$4,'succeeded',now()) ON CONFLICT DO NOTHING
        `, [intent.rows[0]!.id, tender.reference ?? `cash:${intent.rows[0]!.id}`, tender.amount_minor, order.currency_code])
        if (method.method_code === 'cash') {
          await client.query(`
            INSERT INTO mealy.cash_movements (shift_id, order_id, movement_type, amount_minor, currency_code, reason, performed_by, idempotency_key)
            VALUES ($1,$2,'sale',$3,$4,'Counter sale',$5,$6) ON CONFLICT (shift_id, idempotency_key) DO NOTHING
          `, [input.shift_id, orderId, tender.amount_minor, order.currency_code, principal.userId, `${idempotencyKey}:${index}`])
        }
      }
      await client.query(`UPDATE mealy.orders SET paid_total_minor = total_minor, payment_status = 'paid', pos_shift_id = $2, updated_at = now() WHERE id = $1`, [orderId, input.shift_id ?? null])
      await client.query(`INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('order',$1,'payment.captured',$2::jsonb)`, [orderId, JSON.stringify({ amount_minor: tenderTotal, tender_count: input.tenders.length })])

      let receipt = null
      if (input.issue_receipt) {
        const year = financialYear()
        const sequence = await client.query<{ receipt_value: string }>(`
          INSERT INTO mealy.receipt_sequences (outlet_id, financial_year, next_value) VALUES ($1,$2,2)
          ON CONFLICT (outlet_id, financial_year) DO UPDATE SET next_value = mealy.receipt_sequences.next_value + 1, updated_at = now()
          RETURNING (next_value - 1)::text AS receipt_value
        `, [order.outlet_id, year])
        const receiptNumber = `${year}/${String(sequence.rows[0]!.receipt_value).padStart(6, '0')}`
        const legal = await client.query(`
          SELECT canteen.name, canteen.legal_name, canteen.tax_registration_number, outlet.name AS outlet_name, outlet.address
          FROM mealy.outlets outlet JOIN mealy.campus_canteens link ON link.id = outlet.campus_canteen_id
          JOIN mealy.canteens canteen ON canteen.id = link.canteen_id WHERE outlet.id = $1
        `, [order.outlet_id])
        const inserted = await client.query(`
          INSERT INTO mealy.receipts (order_id, receipt_number, financial_year, legal_snapshot, totals_snapshot, issued_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        `, [orderId, receiptNumber, year, legal.rows[0], { subtotal_minor: order.subtotal_minor, discount_total_minor: order.discount_total_minor, tax_total_minor: order.tax_total_minor, charge_total_minor: order.charge_total_minor, rounding_minor: order.rounding_minor, total_minor: order.total_minor, currency_code: order.currency_code }, principal.userId])
        receipt = inserted.rows[0]
        await client.query(`
          INSERT INTO mealy.print_jobs (outlet_id, printer_id, order_id, document_type, payload, idempotency_key)
          SELECT $1, route.printer_id, $2, 'receipt', $3::jsonb, $4
          FROM mealy.printer_routes route WHERE route.outlet_id = $1 AND route.document_type = 'receipt' AND route.is_active
          ORDER BY route.priority LIMIT 1 ON CONFLICT (printer_id, idempotency_key) DO NOTHING
        `, [order.outlet_id, orderId, JSON.stringify({ receipt_id: receipt.id, receipt_number: receipt.receipt_number }), `receipt:${receipt.id}`])
      }
      return { order: await readOrder(client, orderId), receipt }
    })
    return { data: settled }
  })

  app.get<{ Params: { orderId: string } }>('/v1/pos/orders/:orderId/receipt', async (request) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const order = await readOrder(pool, orderId)
    await requireOutletPermission(pool, request, 'payments.read', order.outlet_id)
    const receipt = await pool.query('SELECT * FROM mealy.receipts WHERE order_id = $1 AND voided_at IS NULL ORDER BY issued_at DESC LIMIT 1', [orderId])
    if (!receipt.rows[0]) throw new AppError('RECEIPT_NOT_FOUND', 'No receipt has been issued for this order.', 404)
    return { data: { receipt: receipt.rows[0], order } }
  })

  app.post<{ Params: { orderId: string } }>('/v1/pos/orders/:orderId/refund', async (request) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const input = refundSchema.parse(request.body)
    const principal = requirePrincipal(request)
    const idempotencyKey = requiredIdempotencyKey(request)
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT id FROM mealy.orders WHERE id = $1 FOR UPDATE', [orderId])
      const order = await readOrder(client, orderId)
      await requireOutletPermission(client, request, 'refunds.manage', order.outlet_id)
      const prior = await client.query('SELECT id FROM mealy.refunds WHERE order_id = $1 AND idempotency_key = $2', [orderId, `${idempotencyKey}:0`])
      if (prior.rows[0]) return order
      const refundable = Number(order.paid_total_minor) - Number(order.refunded_total_minor)
      if (refundable <= 0) throw new AppError('NOTHING_TO_REFUND', 'This order has no refundable balance.', 409)
      const payments = await client.query<any>(`
        SELECT tx.*, config.method_code FROM mealy.payment_transactions tx
        JOIN mealy.payment_intents intent ON intent.id = tx.payment_intent_id
        LEFT JOIN mealy.payment_method_configs config ON config.id = intent.payment_method_config_id
        WHERE intent.order_id = $1 AND tx.status = 'succeeded' AND tx.transaction_type IN ('sale','capture')
        ORDER BY tx.created_at
      `, [orderId])
      if (payments.rows.some((payment: any) => payment.method_code !== 'cash') && !input.external_reference) {
        throw new AppError('REFUND_REFERENCE_REQUIRED', 'Enter the external UPI or card refund reference.', 409)
      }
      let remaining = refundable
      for (const [index, payment] of payments.rows.entries()) {
        if (remaining <= 0) break
        const amount = Math.min(remaining, Number(payment.amount_minor))
        const refund = await client.query<{ id: string }>(`
          INSERT INTO mealy.refunds (order_id, payment_transaction_id, reason_code, provider_refund_id, idempotency_key,
            amount_minor, currency_code, status, note, requested_by, processed_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,now())
          ON CONFLICT (order_id, idempotency_key) DO UPDATE SET updated_at = now() RETURNING id
        `, [orderId, payment.id, input.reason_code, input.external_reference ? `${input.external_reference}:${index}` : `cash-refund:${idempotencyKey}:${index}`, `${idempotencyKey}:${index}`, amount, order.currency_code, input.note, principal.userId])
        await client.query(`
          INSERT INTO mealy.payment_transactions (payment_intent_id, transaction_type, provider_transaction_id, amount_minor, currency_code, status, processed_at)
          VALUES ($1,'refund',$2,$3,$4,'succeeded',now()) ON CONFLICT DO NOTHING
        `, [payment.payment_intent_id, input.external_reference ? `${input.external_reference}:${index}` : `cash-refund:${refund.rows[0]!.id}`, amount, order.currency_code])
        if (payment.method_code === 'cash') {
          if (!order.pos_shift_id) throw new AppError('REFUND_SHIFT_REQUIRED', 'The original cash shift is required for this refund.', 409)
          await client.query(`INSERT INTO mealy.cash_movements (shift_id, order_id, movement_type, amount_minor, currency_code, reason, performed_by, idempotency_key) VALUES ($1,$2,'refund',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [order.pos_shift_id, orderId, -amount, order.currency_code, input.note, principal.userId, `${idempotencyKey}:${index}`])
        }
        remaining -= amount
      }
      await client.query(`UPDATE mealy.orders SET refunded_total_minor = paid_total_minor, payment_status = 'refunded', updated_at = now() WHERE id = $1`, [orderId])
      if (['placed','confirmed','preparing','ready_for_pickup'].includes(order.status_code)) {
        await client.query(`SELECT mealy.transition_order($1,'cancelled','staff',$2,$3,$4,NULL)`, [orderId, principal.userId, input.reason_code, input.note])
      }
      await client.query(`INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('order',$1,'payment.refunded',$2::jsonb)`, [orderId, JSON.stringify({ amount_minor: refundable, reason_code: input.reason_code })])
      return readOrder(client, orderId)
    })
    return { data: { order: result } }
  })
}
