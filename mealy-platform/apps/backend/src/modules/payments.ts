import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { requireOutletPermission, requirePrincipal } from '../auth.js'
import { transaction } from '../database.js'
import { AppError } from '../errors.js'
import { readOrder } from '../order-read.js'
import { requiredIdempotencyKey } from '../request-security.js'

const intentSchema = z.object({
  payment_method_config_id: z.string().uuid(),
  amount_minor: z.number().int().positive(),
})

const manualCaptureSchema = z.object({
  amount_minor: z.number().int().positive(),
  reference: z.string().trim().max(160).optional(),
})

export async function registerPaymentRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get<{ Params: { outletId: string } }>('/v1/payments/outlets/:outletId/methods', async (request) => {
    const outletId = z.string().uuid().parse(request.params.outletId)
    const result = await pool.query(`
      SELECT config.id, config.method_code, config.display_name, config.provider, config.public_configuration
      FROM mealy.payment_method_configs config
      JOIN mealy.campus_canteens cc ON cc.canteen_id = config.canteen_id
      JOIN mealy.outlets o ON o.campus_canteen_id = cc.id
      WHERE o.id = $1 AND config.is_enabled AND config.method_code <> 'cash'
        AND 'student_web' = ANY(config.accepted_channels) AND (config.outlet_id IS NULL OR config.outlet_id = $1)
      ORDER BY config.sort_order, config.display_name
    `, [outletId])
    return { data: { methods: result.rows } }
  })

  app.post<{ Params: { orderId: string } }>('/v1/orders/:orderId/payment-intents', async (request, reply) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const input = intentSchema.parse(request.body)
    const principal = requirePrincipal(request)
    const idempotencyKey = requiredIdempotencyKey(request)
    const order = await readOrder(pool, orderId)
    if (order.student_user_id !== principal.userId) await requireOutletPermission(pool, request, 'payments.manage', order.outlet_id)
    const method = await pool.query<{ id: string; provider: string | null; method_code: string }>(`
      SELECT config.id, config.provider, config.method_code
      FROM mealy.payment_method_configs config
      JOIN mealy.campus_canteens cc ON cc.canteen_id = config.canteen_id
      JOIN mealy.outlets o ON o.campus_canteen_id = cc.id
      WHERE config.id = $1 AND o.id = $2 AND config.is_enabled AND config.method_code <> 'cash'
        AND 'student_web' = ANY(config.accepted_channels) AND (config.outlet_id IS NULL OR config.outlet_id = $2)
    `, [input.payment_method_config_id, order.outlet_id])
    if (!method.rows[0] || !method.rows[0].provider) throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 'An online payment method is not configured for this outlet.', 409)
    const remaining = Number(order.total_minor) - Number(order.paid_total_minor)
    if (input.amount_minor > remaining) throw new AppError('PAYMENT_AMOUNT_EXCEEDS_BALANCE', 'Payment exceeds the remaining balance.', 409)

    const result = await pool.query(`
      INSERT INTO mealy.payment_intents (
        order_id, payment_method_config_id, provider, idempotency_key, amount_minor, currency_code, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (order_id, idempotency_key) DO UPDATE SET updated_at = now()
      RETURNING *
    `, [orderId, input.payment_method_config_id, method.rows[0].provider, idempotencyKey,
      input.amount_minor, order.currency_code, method.rows[0].method_code === 'cash' ? 'created' : 'requires_action'])
    return reply.status(201).send({
      data: { intent: result.rows[0], provider_action: method.rows[0].method_code === 'cash' ? null : { status: 'provider_adapter_required' } },
    })
  })

  app.post<{ Params: { intentId: string } }>('/v1/payment-intents/:intentId/manual-capture', async (request) => {
    const intentId = z.string().uuid().parse(request.params.intentId)
    const input = manualCaptureSchema.parse(request.body)
    const result = await transaction(pool, async (client) => {
      const intentResult = await client.query<any>(`
        SELECT intent.*, order_record.outlet_id, config.method_code
        FROM mealy.payment_intents intent
        JOIN mealy.orders order_record ON order_record.id = intent.order_id
        LEFT JOIN mealy.payment_method_configs config ON config.id = intent.payment_method_config_id
        WHERE intent.id = $1 FOR UPDATE
      `, [intentId])
      const intent = intentResult.rows[0]
      if (!intent) throw new AppError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', 404)
      await requireOutletPermission(client, request, 'payments.manage', intent.outlet_id)
      if (intent.method_code !== 'cash') throw new AppError('MANUAL_CAPTURE_NOT_ALLOWED', 'Only an enabled cash intent can be captured manually.', 409)
      if (intent.status === 'captured') return intent
      if (input.amount_minor !== Number(intent.amount_minor)) throw new AppError('PAYMENT_AMOUNT_MISMATCH', 'Captured amount must match the intent.', 409)
      const order = await client.query<{ total_minor: string; paid_total_minor: string }>('SELECT total_minor, paid_total_minor FROM mealy.orders WHERE id = $1 FOR UPDATE', [intent.order_id])
      if (!order.rows[0] || Number(order.rows[0].paid_total_minor) + input.amount_minor > Number(order.rows[0].total_minor)) {
        throw new AppError('PAYMENT_AMOUNT_EXCEEDS_BALANCE', 'Payment exceeds the remaining balance.', 409)
      }
      const transactionId = `cash:${intent.id}`
      await client.query(`
        INSERT INTO mealy.payment_transactions (
          payment_intent_id, transaction_type, provider_transaction_id, amount_minor, currency_code, status, processed_at
        ) VALUES ($1,'sale',$2,$3,$4,'succeeded',now())
        ON CONFLICT DO NOTHING
      `, [intent.id, transactionId, input.amount_minor, intent.currency_code])
      await client.query("UPDATE mealy.payment_intents SET status = 'captured', updated_at = now(), metadata = metadata || $2::jsonb WHERE id = $1", [
        intent.id, JSON.stringify({ manual_reference: input.reference ?? null }),
      ])
      await client.query(`
        UPDATE mealy.orders SET paid_total_minor = paid_total_minor + $2,
          payment_status = CASE WHEN paid_total_minor + $2 >= total_minor THEN 'paid' ELSE 'partially_paid' END
        WHERE id = $1
      `, [intent.order_id, input.amount_minor])
      await client.query(`
        INSERT INTO mealy.outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order',$1,'payment.captured',$2::jsonb)
      `, [intent.order_id, JSON.stringify({ payment_intent_id: intent.id, amount_minor: input.amount_minor })])
      return (await client.query('SELECT * FROM mealy.payment_intents WHERE id = $1', [intent.id])).rows[0]
    })
    return { data: { intent: result } }
  })

  app.post<{ Params: { provider: string } }>('/v1/payments/webhooks/:provider', async (request, reply) => {
    const provider = z.string().trim().min(1).max(80).parse(request.params.provider)
    const providerEventId = String(request.headers['x-provider-event-id'] ?? '').trim()
    if (!providerEventId) throw new AppError('PROVIDER_EVENT_ID_REQUIRED', 'Provider event identifier is required.', 400)
    const payload = (request.body ?? {}) as Record<string, unknown>
    await pool.query(`
      INSERT INTO mealy.webhook_events (
        provider, provider_event_id, event_type, signature_valid, payload_redacted, payload_hash, status
      ) VALUES ($1,$2,$3,false,$4,$5,'received')
      ON CONFLICT (provider, provider_event_id) DO NOTHING
    `, [provider, providerEventId, String(payload.type ?? 'unknown'), payload,
      createHash('sha256').update(JSON.stringify(payload)).digest('hex')])
    return reply.status(202).send({ data: { accepted: true, verification: 'provider_adapter_required' } })
  })
}
