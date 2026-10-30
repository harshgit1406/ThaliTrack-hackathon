export type OrderSource = 'Counter POS' | 'Student app' | 'QR order'
export type TicketStatus = 'new' | 'preparing' | 'ready'
export type ItemStatus = 'pending' | 'ready'

export type GatewayTicketItem = {
  id: string
  name: string
  quantity: number
  status: ItemStatus
  modifiers?: string[]
  note?: string
}

export type GatewayTicket = {
  id: string
  orderId: string
  kotNumber: string
  orderNumber: string
  token: string
  source: OrderSource
  status: TicketStatus
  receivedAt: string
  promisedMinutes: number
  priority?: boolean
  customerNote?: string
  version: number
  items: GatewayTicketItem[]
}

export type CreateOrderInput = {
  orderId?: string
  ticketId?: string
  orderNumber?: string
  kotNumber?: string
  token?: string
  source: OrderSource
  promisedMinutes?: number
  priority?: boolean
  customerNote?: string
  items: Array<{
    id?: string
    catalogItemId?: string
    variantId?: string
    unitPriceMinor?: number
    name: string
    quantity: number
    modifiers?: string[]
    note?: string
  }>
  commercial?: {
    counterId: string
    terminalId: string
    shiftId: string
    staffUserId: string
    paymentMethodConfigId: string
    currencyCode: string
    subtotalMinor: number
    totalMinor: number
  }
}

export type GatewayEvent = {
  sequence: number
  eventId: string
  eventType: string
  aggregateId: string
  occurredAt: string
  payload: Record<string, unknown>
}

export type OutboxEvent = GatewayEvent & {
  attempts: number
}

export type CloudOrder = {
  id: string
  public_number: string
  source_channel: 'student_web' | 'pos' | 'admin' | 'kiosk' | 'api'
  status_code: string
  customer_note?: string | null
  placed_at: string
  promised_at?: string | null
  token_label?: string | null
  items: Array<{
    id: string
    kot_item_id?: string | null
    name: string
    variant_name?: string | null
    quantity: number
    notes?: string | null
  }>
  kots: Array<{ id: string; number: number; status: string }>
}
