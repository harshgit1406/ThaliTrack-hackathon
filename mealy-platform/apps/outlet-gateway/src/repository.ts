import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { GatewayError } from './domain.js'
import type { CloudOrder, CreateOrderInput, GatewayEvent, GatewayTicket, GatewayTicketItem, ItemStatus, OutboxEvent, TicketStatus } from './types.js'

type TicketRow = {
  id: string
  order_id: string
  kot_number: string
  order_number: string
  token: string
  source: GatewayTicket['source']
  status: TicketStatus
  received_at: string
  promised_minutes: number
  priority: number
  customer_note: string | null
  version: number
}

type ItemRow = {
  id: string
  name: string
  quantity: number
  status: ItemStatus
  modifiers_json: string
  note: string | null
}

type EventRow = {
  sequence: number
  event_id: string
  event_type: string
  aggregate_id: string
  occurred_at: string
  payload_json: string
  attempts?: number
}

type IdempotencyRow = { request_hash: string; response_json: string }

export type SyncStatus = {
  pending: number
  failed: number
  oldestPendingAt?: string
  lastAcknowledgedAt?: string
}

export class GatewayRepository {
  private readonly database: Database.Database

  constructor(
    databasePath: string,
    private readonly onEvent: (event: GatewayEvent) => void = () => undefined,
  ) {
    mkdirSync(path.dirname(databasePath), { recursive: true })
    this.database = new Database(databasePath)
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.migrate()
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL,
        token TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('Counter POS', 'Student app', 'QR order')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
        kot_number TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('new', 'preparing', 'ready')),
        received_at TEXT NOT NULL,
        promised_minutes INTEGER NOT NULL CHECK (promised_minutes > 0),
        priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
        customer_note TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ticket_items (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
        modifiers_json TEXT NOT NULL DEFAULT '[]',
        note TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ticket_items_ticket_idx ON ticket_items(ticket_id);
      CREATE INDEX IF NOT EXISTS tickets_queue_idx ON tickets(status, received_at);

      CREATE TABLE IF NOT EXISTS idempotency_records (
        key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_log (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        event_id TEXT PRIMARY KEY REFERENCES event_log(event_id) ON DELETE RESTRICT,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        acknowledged_at TEXT,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_outbox_due_idx ON sync_outbox(acknowledged_at, next_attempt_at);

      CREATE TABLE IF NOT EXISTS cloud_delivery_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        last_acknowledged_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_acknowledged_sequence >= 0),
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO cloud_delivery_state (singleton, last_acknowledged_sequence, updated_at)
      VALUES (1, 0, datetime('now'));

      CREATE TABLE IF NOT EXISTS token_blocks (
        id TEXT PRIMARY KEY,
        counter_id TEXT NOT NULL,
        service_date TEXT NOT NULL,
        token_prefix TEXT NOT NULL,
        range_start INTEGER NOT NULL,
        range_end INTEGER NOT NULL,
        next_value INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      UPDATE token_blocks SET service_date = substr(service_date, 1, 10) WHERE length(service_date) > 10;

      CREATE TABLE IF NOT EXISTS runtime_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    const orderColumns = this.database.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>
    if (!orderColumns.some((column) => column.name === 'is_active')) {
      this.database.exec('ALTER TABLE orders ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))')
    }
  }

  close(): void {
    this.database.close()
  }

  isHealthy(): boolean {
    const row = this.database.prepare('SELECT 1 AS ok').get() as { ok: number }
    return row.ok === 1
  }

  getTickets(): GatewayTicket[] {
    const rows = this.database.prepare(`
      SELECT t.id, t.order_id, t.kot_number, o.order_number, o.token, o.source, t.status,
             t.received_at, t.promised_minutes, t.priority, t.customer_note, t.version
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      WHERE o.is_active = 1
      ORDER BY CASE t.status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
               t.priority DESC, t.received_at ASC
    `).all() as unknown as TicketRow[]

    return rows.map((row) => this.mapTicket(row))
  }

  getTicket(ticketId: string): GatewayTicket {
    const row = this.database.prepare(`
      SELECT t.id, t.order_id, t.kot_number, o.order_number, o.token, o.source, t.status,
             t.received_at, t.promised_minutes, t.priority, t.customer_note, t.version
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      WHERE t.id = ?
    `).get(ticketId) as TicketRow | undefined

    if (!row) throw new GatewayError('TICKET_NOT_FOUND', 'Kitchen ticket was not found.', 404)
    return this.mapTicket(row)
  }

  private mapTicket(row: TicketRow): GatewayTicket {
    const itemRows = this.database.prepare(`
      SELECT id, name, quantity, status, modifiers_json, note
      FROM ticket_items WHERE ticket_id = ? ORDER BY rowid ASC
    `).all(row.id) as unknown as ItemRow[]

    const items: GatewayTicketItem[] = itemRows.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
      modifiers: JSON.parse(item.modifiers_json) as string[],
      note: item.note ?? undefined,
    }))

    return {
      id: row.id,
      orderId: row.order_id,
      kotNumber: row.kot_number,
      orderNumber: row.order_number,
      token: row.token,
      source: row.source,
      status: row.status,
      receivedAt: row.received_at,
      promisedMinutes: row.promised_minutes,
      priority: row.priority === 1,
      customerNote: row.customer_note ?? undefined,
      version: row.version,
      items,
    }
  }

  createOrder(input: CreateOrderInput, idempotencyKey: string): GatewayTicket {
    if (!idempotencyKey.trim()) throw new GatewayError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required.', 400)
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const existing = this.database.prepare('SELECT request_hash, response_json FROM idempotency_records WHERE key = ?')
      .get(idempotencyKey) as IdempotencyRow | undefined

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new GatewayError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for another request.', 409)
      }
      return JSON.parse(existing.response_json) as GatewayTicket
    }

    const orderId = input.orderId ?? randomUUID()
    const ticketId = input.ticketId ?? randomUUID()
    const now = new Date().toISOString()
    const reserved = input.token ? undefined : this.takeReservedToken(input.commercial?.counterId)
    const token = input.token ?? reserved?.label
    if (!token) throw new GatewayError('OFFLINE_TOKEN_UNAVAILABLE', 'No reserved offline tokens remain. Reconnect before creating another cash order.', 409)
    const orderNumber = input.orderNumber ?? `OFF-${Date.now()}`
    const kotNumber = input.kotNumber ?? `KOT-${token}`
    let event: GatewayEvent | undefined
    let ticket: GatewayTicket | undefined

    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO orders (id, order_number, token, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(orderId, orderNumber, token, input.source, now, now)
      this.database.prepare(`
        INSERT INTO tickets (id, order_id, kot_number, status, received_at, promised_minutes, priority, customer_note, version, updated_at)
        VALUES (?, ?, ?, 'new', ?, ?, ?, ?, 1, ?)
      `).run(ticketId, orderId, kotNumber, now, input.promisedMinutes ?? 15, input.priority ? 1 : 0, input.customerNote ?? null, now)

      const insertItem = this.database.prepare(`
        INSERT INTO ticket_items (id, ticket_id, name, quantity, status, modifiers_json, note, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      `)
      for (const item of input.items) {
        insertItem.run(item.id ?? randomUUID(), ticketId, item.name, item.quantity, JSON.stringify(item.modifiers ?? []), item.note ?? null, now)
      }

      ticket = this.getTicket(ticketId)
      event = this.recordEvent('ticket.created', ticketId, {
        ticket,
        commercial: input.commercial ? {
          ...input.commercial,
          tokenNumber: reserved?.number,
          items: input.items.map((item, index) => ({
            ticketItemId: ticket!.items[index]!.id,
            catalogItemId: item.catalogItemId,
            variantId: item.variantId,
            unitPriceMinor: item.unitPriceMinor,
            quantity: item.quantity,
            note: item.note,
          })),
        } : undefined,
      })
      this.database.prepare(`
        INSERT INTO idempotency_records (key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?)
      `).run(idempotencyKey, requestHash, JSON.stringify(ticket), now)
    })

    if (!ticket || !event) throw new Error('Order transaction completed without a ticket event')
    this.onEvent(event)
    return ticket
  }

  saveTokenBlock(block: { id: string; counter_id: string; service_date: string; token_prefix: string; range_start: number; range_end: number; next_value: number; status: string }): void {
    this.database.prepare(`
      INSERT INTO token_blocks (id, counter_id, service_date, token_prefix, range_start, range_end, next_value, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET next_value = excluded.next_value, status = excluded.status, updated_at = excluded.updated_at
    `).run(block.id, block.counter_id, block.service_date.slice(0, 10), block.token_prefix, block.range_start, block.range_end, block.next_value, block.status, new Date().toISOString())
  }

  remainingReservedTokens(counterId?: string): number {
    if (!counterId) return 0
    const row = this.database.prepare(`SELECT COALESCE(sum(range_end - next_value + 1),0) AS remaining FROM token_blocks WHERE counter_id = ? AND service_date = date('now') AND status = 'active' AND next_value <= range_end`).get(counterId) as { remaining: number }
    return row.remaining
  }

  saveCapabilities(capabilities: string[]): void {
    this.database.prepare(`INSERT INTO runtime_settings (key, value_json, updated_at) VALUES ('capabilities', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(JSON.stringify(capabilities), new Date().toISOString())
  }

  getCapabilities(): string[] {
    const row = this.database.prepare(`SELECT value_json FROM runtime_settings WHERE key = 'capabilities'`).get() as { value_json: string } | undefined
    return row ? JSON.parse(row.value_json) as string[] : []
  }

  hasCapability(capability: string, cloudConfigured: boolean): boolean {
    const capabilities = this.getCapabilities()
    return capabilities.includes(capability) || (!cloudConfigured && !this.getCapabilities().length)
  }

  private takeReservedToken(counterId?: string): { number: number; label: string } | undefined {
    if (!counterId) return undefined
    let result: { number: number; label: string } | undefined
    this.transaction(() => {
      const block = this.database.prepare(`SELECT * FROM token_blocks WHERE counter_id = ? AND service_date = date('now') AND status = 'active' AND next_value <= range_end ORDER BY range_start LIMIT 1`).get(counterId) as { id: string; token_prefix: string; next_value: number; range_end: number } | undefined
      if (!block) return
      result = { number: block.next_value, label: `${block.token_prefix}${block.next_value}` }
      this.database.prepare(`UPDATE token_blocks SET next_value = next_value + 1, status = CASE WHEN next_value + 1 > range_end THEN 'exhausted' ELSE status END, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), block.id)
    })
    return result
  }

  startTicket(ticketId: string): GatewayTicket {
    return this.updateTicket(ticketId, 'ticket.preparing', (current, now) => {
      if (current.status !== 'new') throw new GatewayError('INVALID_TICKET_TRANSITION', 'Only a new ticket can start preparing.', 409)
      this.database.prepare(`UPDATE tickets SET status = 'preparing', version = version + 1, updated_at = ? WHERE id = ?`).run(now, ticketId)
    })
  }

  setItemReadiness(ticketId: string, itemId: string, ready: boolean): GatewayTicket {
    return this.updateTicket(ticketId, ready ? 'ticket.item_ready' : 'ticket.item_reopened', (current, now) => {
      if (current.status !== 'preparing') {
        throw new GatewayError('INVALID_ITEM_TRANSITION', 'Items can only change while the ticket is preparing.', 409)
      }
      const item = current.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new GatewayError('ITEM_NOT_FOUND', 'Kitchen ticket item was not found.', 404)
      const nextStatus: ItemStatus = ready ? 'ready' : 'pending'
      if (item.status !== nextStatus) {
        this.database.prepare('UPDATE ticket_items SET status = ?, updated_at = ? WHERE id = ? AND ticket_id = ?')
          .run(nextStatus, now, itemId, ticketId)
        this.database.prepare('UPDATE tickets SET version = version + 1, updated_at = ? WHERE id = ?').run(now, ticketId)
      }
    })
  }

  markTicketReady(ticketId: string): GatewayTicket {
    return this.updateTicket(ticketId, 'ticket.ready', (current, now) => {
      if (current.status !== 'preparing') throw new GatewayError('INVALID_TICKET_TRANSITION', 'Only a preparing ticket can become ready.', 409)
      if (!current.items.every((item) => item.status === 'ready')) {
        throw new GatewayError('ITEMS_NOT_READY', 'Every item must be ready before the order can be marked ready.', 409)
      }
      this.database.prepare(`UPDATE tickets SET status = 'ready', version = version + 1, updated_at = ? WHERE id = ?`).run(now, ticketId)
    })
  }

  delayTicket(ticketId: string, minutes: number, reason: string): GatewayTicket {
    return this.updateTicket(ticketId, 'ticket.delayed', (current, now) => {
      if (current.status === 'ready') throw new GatewayError('INVALID_TICKET_TRANSITION', 'A ready ticket cannot be delayed.', 409)
      this.database.prepare('UPDATE tickets SET promised_minutes = promised_minutes + ?, priority = 1, version = version + 1, updated_at = ? WHERE id = ?')
        .run(minutes, now, ticketId)
    }, { minutes, reason })
  }

  remakeTicket(ticketId: string, reason: string): GatewayTicket {
    return this.updateTicket(ticketId, 'ticket.remake', (current, now) => {
      if (current.status !== 'ready') throw new GatewayError('INVALID_TICKET_TRANSITION', 'Only a ready ticket can be sent for remake.', 409)
      this.database.prepare("UPDATE ticket_items SET status = 'pending', updated_at = ? WHERE ticket_id = ?").run(now, ticketId)
      this.database.prepare("UPDATE tickets SET status = 'preparing', priority = 1, version = version + 1, updated_at = ? WHERE id = ?").run(now, ticketId)
    }, { reason })
  }

  private updateTicket(
    ticketId: string,
    eventType: string,
    update: (current: GatewayTicket, now: string) => void,
    metadata: Record<string, unknown> = {},
  ): GatewayTicket {
    let updated: GatewayTicket | undefined
    let event: GatewayEvent | undefined
    this.transaction(() => {
      const current = this.getTicket(ticketId)
      update(current, new Date().toISOString())
      updated = this.getTicket(ticketId)
      event = this.recordEvent(eventType, ticketId, { ticket: updated, ...metadata })
    })

    if (!updated || !event) throw new Error('Ticket update completed without an event')
    this.onEvent(event)
    return updated
  }

  private recordEvent(eventType: string, aggregateId: string, payload: Record<string, unknown>, upload = true): GatewayEvent {
    const eventId = randomUUID()
    const occurredAt = new Date().toISOString()
    const result = this.database.prepare(`
      INSERT INTO event_log (event_id, event_type, aggregate_id, payload_json, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, eventType, aggregateId, JSON.stringify(payload), occurredAt)
    if (upload) {
      this.database.prepare(`
        INSERT INTO sync_outbox (event_id, attempts, next_attempt_at) VALUES (?, 0, ?)
      `).run(eventId, occurredAt)
    }
    return {
      sequence: Number(result.lastInsertRowid),
      eventId,
      eventType,
      aggregateId,
      occurredAt,
      payload,
    }
  }

  getEventsAfter(sequence: number, limit = 200): GatewayEvent[] {
    const rows = this.database.prepare(`
      SELECT sequence, event_id, event_type, aggregate_id, payload_json, occurred_at
      FROM event_log WHERE sequence > ? ORDER BY sequence ASC LIMIT ?
    `).all(sequence, limit) as unknown as EventRow[]
    return rows.map((row) => this.mapEvent(row))
  }

  getDueOutbox(limit = 100): OutboxEvent[] {
    const rows = this.database.prepare(`
      SELECT e.sequence, e.event_id, e.event_type, e.aggregate_id, e.payload_json, e.occurred_at, o.attempts
      FROM sync_outbox o JOIN event_log e ON e.event_id = o.event_id
      WHERE o.acknowledged_at IS NULL AND o.next_attempt_at <= ?
      ORDER BY e.sequence ASC LIMIT ?
    `).all(new Date().toISOString(), limit) as unknown as EventRow[]
    return rows.map((row) => ({ ...this.mapEvent(row), attempts: row.attempts ?? 0 }))
  }

  acknowledgeOutbox(eventIds: string[]): void {
    const now = new Date().toISOString()
    this.transaction(() => {
      const statement = this.database.prepare('UPDATE sync_outbox SET acknowledged_at = ?, last_error = NULL WHERE event_id = ?')
      for (const eventId of eventIds) statement.run(now, eventId)
    })
  }

  failOutbox(eventIds: string[], error: string, delayMs: number): void {
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString()
    this.transaction(() => {
      const statement = this.database.prepare(`
        UPDATE sync_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE event_id = ?
      `)
      for (const eventId of eventIds) statement.run(nextAttemptAt, error.slice(0, 500), eventId)
    })
  }

  getSyncStatus(): SyncStatus {
    const pending = this.database.prepare(`
      SELECT COUNT(*) AS count, MIN(e.occurred_at) AS oldest
      FROM sync_outbox o JOIN event_log e ON e.event_id = o.event_id
      WHERE o.acknowledged_at IS NULL
    `).get() as { count: number; oldest: string | null }
    const failed = this.database.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE acknowledged_at IS NULL AND attempts > 0`).get() as { count: number }
    const acknowledged = this.database.prepare(`SELECT MAX(acknowledged_at) AS latest FROM sync_outbox`).get() as { latest: string | null }
    return {
      pending: pending.count,
      failed: failed.count,
      oldestPendingAt: pending.oldest ?? undefined,
      lastAcknowledgedAt: acknowledged.latest ?? undefined,
    }
  }

  getCloudCursor(): number {
    const row = this.database.prepare('SELECT last_acknowledged_sequence AS sequence FROM cloud_delivery_state WHERE singleton = 1')
      .get() as { sequence: number }
    return row.sequence
  }

  ingestCloudOrder(order: CloudOrder, sequence: number): GatewayTicket {
    let ticket: GatewayTicket | undefined
    let publishedEvent: GatewayEvent | undefined
    this.transaction(() => {
      const existing = this.database.prepare('SELECT id FROM orders WHERE id = ?').get(order.id) as { id: string } | undefined
      const cloudKot = order.kots[0]
      if (!cloudKot) throw new GatewayError('CLOUD_ORDER_INVALID', 'Cloud order has no kitchen ticket.', 409)
      const now = new Date().toISOString()
      if (!existing) {
        const source = order.source_channel === 'student_web' ? 'Student app'
          : order.source_channel === 'kiosk' ? 'QR order' : 'Counter POS'
        const active = ['collected', 'cancelled', 'rejected'].includes(order.status_code) ? 0 : 1
        this.database.prepare(`
          INSERT INTO orders (id, order_number, token, source, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(order.id, order.public_number, order.token_label ?? order.public_number, source, active, order.placed_at, now)
        const promisedMinutes = order.promised_at
          ? Math.max(1, Math.min(240, Math.round((Date.parse(order.promised_at) - Date.parse(order.placed_at)) / 60_000)))
          : 15
        this.database.prepare(`
          INSERT INTO tickets (id, order_id, kot_number, status, received_at, promised_minutes, priority, customer_note, version, updated_at)
          VALUES (?, ?, ?, 'new', ?, ?, 0, ?, 1, ?)
        `).run(cloudKot.id, order.id, `KOT-${cloudKot.number}`, order.placed_at, promisedMinutes, order.customer_note ?? null, now)
        const insertItem = this.database.prepare(`
          INSERT INTO ticket_items (id, ticket_id, name, quantity, status, modifiers_json, note, updated_at)
          VALUES (?, ?, ?, ?, 'pending', '[]', ?, ?)
        `)
        for (const item of order.items) {
          const displayName = item.variant_name ? `${item.name} - ${item.variant_name}` : item.name
          insertItem.run(item.kot_item_id ?? item.id, cloudKot.id, displayName, item.quantity, item.notes ?? null, now)
        }
        ticket = this.getTicket(cloudKot.id)
        publishedEvent = this.recordEvent('ticket.cloud_received', cloudKot.id, { ticket }, false)
      } else {
        const active = ['collected', 'cancelled', 'rejected'].includes(order.status_code) ? 0 : 1
        this.database.prepare('UPDATE orders SET order_number = ?, token = ?, is_active = ?, updated_at = ? WHERE id = ?')
          .run(order.public_number, order.token_label ?? order.public_number, active, now, order.id)
        ticket = this.getTicket(cloudKot.id)
      }
      this.database.prepare(`
        UPDATE cloud_delivery_state SET last_acknowledged_sequence = MAX(last_acknowledged_sequence, ?), updated_at = ?
        WHERE singleton = 1
      `).run(sequence, now)
    })
    if (!ticket) throw new Error('Cloud order ingestion did not return a ticket')
    if (publishedEvent) this.onEvent(publishedEvent)
    return ticket
  }

  private mapEvent(row: EventRow): GatewayEvent {
    return {
      sequence: row.sequence,
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateId: row.aggregate_id,
      occurredAt: row.occurred_at,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
