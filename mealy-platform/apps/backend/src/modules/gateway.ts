import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { authenticateGateway } from '../gateway-auth.js'
import { AppError } from '../errors.js'
import { transaction } from '../database.js'

const syncSchema = z.object({
  gateway_id: z.string().min(1).max(160),
  outlet_id: z.string().min(1).max(160),
  events: z.array(z.object({
    sequence: z.number().int().positive(),
    eventId: z.string().min(1).max(160),
    eventType: z.string().min(1).max(160),
    aggregateId: z.string().min(1).max(160),
    occurredAt: z.string().datetime(),
    payload: z.record(z.string(), z.unknown()),
  })).min(1).max(100),
})

export async function registerGatewayRoutes(app: FastifyInstance, pool: pg.Pool): Promise<void> {
  app.get('/v1/gateway/context', async (request) => {
    const gateway = await authenticateGateway(pool, request)
    const features = await pool.query<{ feature_code: string }>(`
      SELECT feature.feature_code FROM mealy.canteen_features feature
      JOIN mealy.campus_canteens link ON link.canteen_id = feature.canteen_id
      JOIN mealy.outlets outlet ON outlet.campus_canteen_id = link.id
      WHERE outlet.id = $1 AND feature.enabled AND feature.effective_from <= now()
        AND (feature.effective_until IS NULL OR feature.effective_until > now())
    `, [gateway.outletId])
    return { data: { gateway_id: gateway.gatewayKey, outlet_id: gateway.outletId, capabilities: features.rows.map((row) => row.feature_code) } }
  })

  app.post('/v1/gateway/token-blocks/reserve', async (request, reply) => {
    const gateway = await authenticateGateway(pool, request)
    const input = z.object({ counter_id: z.string().uuid(), size: z.number().int().min(5).max(100).default(25) }).parse(request.body)
    const block = await transaction(pool, async (client) => {
      const counter = await client.query<{ token_prefix: string }>('SELECT token_prefix FROM mealy.service_counters WHERE id = $1 AND outlet_id = $2 AND status = $3', [input.counter_id, gateway.outletId, 'active'])
      if (!counter.rows[0]) throw new AppError('COUNTER_NOT_FOUND', 'The counter is not active for this gateway outlet.', 404)
      const serviceDate = new Date().toISOString().slice(0, 10)
      const sequence = await client.query<{ range_start: number; range_end: number }>(`
        INSERT INTO mealy.token_sequences (counter_id, service_date, next_value) VALUES ($1,$2::date,$3 + 1)
        ON CONFLICT (counter_id, service_date) DO UPDATE
          SET next_value = mealy.token_sequences.next_value + $3, updated_at = now()
        RETURNING next_value - $3 AS range_start, next_value - 1 AS range_end
      `, [input.counter_id, serviceDate, input.size])
      const range = sequence.rows[0]!
      const inserted = await client.query(`
        INSERT INTO mealy.gateway_token_blocks (gateway_id, counter_id, service_date, token_prefix, range_start, range_end, next_value)
        VALUES ($1,$2,$3,$4,$5,$6,$5) RETURNING *
      `, [gateway.id, input.counter_id, serviceDate, counter.rows[0].token_prefix, range.range_start, range.range_end])
      return inserted.rows[0]
    })
    return reply.status(201).send({ data: { block } })
  })

  app.get('/v1/gateway/print-jobs', async (request) => {
    const gateway = await authenticateGateway(pool, request)
    const jobs = await transaction(pool, async (client) => {
      const result = await client.query<any>(`
        WITH selected AS (
          SELECT id FROM mealy.print_jobs
          WHERE outlet_id = $1 AND status IN ('queued','failed') AND available_at <= now()
          ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
        ), claimed AS (
          UPDATE mealy.print_jobs job SET status = 'claimed', claimed_at = now(), attempts = attempts + 1, updated_at = now()
          FROM selected WHERE job.id = selected.id RETURNING job.*
        )
        SELECT job.id, job.document_type, job.attempts, job.payload, printer.code AS printer_code,
               printer.name AS printer_name, printer.connection_config, printer.paper_width_mm,
               orders.public_number, token.token_label, orders.customer_name_snapshot, orders.customer_note,
               orders.subtotal_minor, orders.discount_total_minor, orders.tax_total_minor, orders.charge_total_minor,
               orders.rounding_minor, orders.total_minor, orders.currency_code,
               receipt.receipt_number, receipt.issued_at,
               COALESCE(jsonb_agg(jsonb_build_object('name', item.item_name_snapshot, 'variant', item.variant_name_snapshot,
                 'quantity', item.quantity, 'unit_price_minor', item.unit_price_minor, 'line_total_minor', item.line_total_minor,
                 'notes', item.notes) ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) AS items
        FROM claimed job
        JOIN mealy.printers printer ON printer.id = job.printer_id
        LEFT JOIN mealy.orders orders ON orders.id = job.order_id
        LEFT JOIN mealy.order_tokens token ON token.order_id = orders.id AND token.voided_at IS NULL
        LEFT JOIN mealy.order_items item ON item.order_id = orders.id
        LEFT JOIN LATERAL (SELECT * FROM mealy.receipts r WHERE r.order_id = orders.id AND r.voided_at IS NULL ORDER BY r.issued_at DESC LIMIT 1) receipt ON true
        GROUP BY job.id, job.document_type, job.attempts, job.payload, job.created_at,
          printer.id, orders.id, token.token_label, receipt.id, receipt.receipt_number, receipt.issued_at
        ORDER BY job.created_at
      `, [gateway.outletId])
      return result.rows
    })
    return { data: { jobs } }
  })

  app.post<{ Params: { jobId: string } }>('/v1/gateway/print-jobs/:jobId/result', async (request) => {
    const gateway = await authenticateGateway(pool, request)
    const jobId = z.string().uuid().parse(request.params.jobId)
    const input = z.object({ printed: z.boolean(), error: z.string().trim().max(1000).optional() }).parse(request.body)
    const updated = await pool.query(`
      UPDATE mealy.print_jobs SET status = CASE WHEN $3 THEN 'printed' ELSE 'failed' END,
        printed_at = CASE WHEN $3 THEN now() ELSE NULL END, failed_at = CASE WHEN $3 THEN NULL ELSE now() END,
        last_error = CASE WHEN $3 THEN NULL ELSE $4 END,
        available_at = CASE WHEN $3 THEN available_at ELSE now() + make_interval(secs => LEAST(60, power(2, LEAST(attempts, 6))::int)) END,
        updated_at = now()
      WHERE id = $1 AND outlet_id = $2 AND status = 'claimed' RETURNING id, status, attempts
    `, [jobId, gateway.outletId, input.printed, input.error ?? 'Printer did not confirm the job'])
    if (!updated.rows[0]) throw new AppError('PRINT_JOB_NOT_FOUND', 'Claimed print job was not found for this gateway.', 404)
    return { data: { job: updated.rows[0] } }
  })

  app.post('/v1/outlet-sync', async (request) => {
    const gateway = await authenticateGateway(pool, request)
    const input = syncSchema.parse(request.body)
    if (input.gateway_id !== gateway.gatewayKey || input.outlet_id !== gateway.outletId) {
      throw new AppError('GATEWAY_SCOPE_MISMATCH', 'Gateway identity does not match its assigned outlet.', 403)
    }
    const acknowledged: string[] = []
    for (const event of input.events) {
      await pool.query(`
        INSERT INTO mealy.gateway_ingest_events (
          gateway_id, event_id, event_type, aggregate_id, gateway_sequence, payload, occurred_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (gateway_id, event_id) DO NOTHING
      `, [gateway.id, event.eventId, event.eventType, event.aggregateId, event.sequence, event.payload, event.occurredAt])
      acknowledged.push(event.eventId)
    }
    await pool.query('UPDATE mealy.outlet_gateways SET last_seen_at = now() WHERE id = $1', [gateway.id])
    return { acknowledged_event_ids: acknowledged }
  })
}
