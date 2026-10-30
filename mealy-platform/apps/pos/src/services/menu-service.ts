import type { CartLine, MenuItem, PosOrder } from '../types'

const apiBaseUrl = (import.meta.env.VITE_MEALY_API_BASE_URL ?? '').trim().replace(/\/$/, '')
const outletId = (import.meta.env.VITE_MEALY_OUTLET_ID ?? '').trim()
const counterId = (import.meta.env.VITE_MEALY_COUNTER_ID ?? '').trim()
const terminalId = (import.meta.env.VITE_MEALY_TERMINAL_ID ?? '').trim()
const gatewayUrl = (import.meta.env.VITE_MEALY_GATEWAY_URL ?? '').trim().replace(/\/$/, '')
const gatewayToken = (import.meta.env.VITE_MEALY_GATEWAY_TOKEN ?? '').trim()

export type PosPaymentMethod = {
  id: string
  method_code: string
  display_name: string
  provider: string | null
}

export type PosContext = {
  context: {
    outlet_id: string
    outlet_name: string
    canteen_name: string
    counter_id: string
    counter_name: string
    terminal_id: string
    terminal_name: string
    currency_code: string
  }
  user: { id: string; display_name: string }
  payment_methods: PosPaymentMethod[]
  cash_registers: Array<{ id: string; code: string; name: string }>
  open_shift: { id: string; opening_cash_minor: string | number; opened_at: string } | null
}

export type Receipt = {
  id: string
  receipt_number: string
  issued_at: string
  totals_snapshot: { total_minor: string | number; currency_code: string }
}

function accessToken(): string {
  return window.sessionStorage.getItem('mealy-access-token')?.trim() ?? ''
}

function requireConfiguration(): void {
  if (!apiBaseUrl || !outletId) throw new Error('Configure VITE_MEALY_API_BASE_URL and VITE_MEALY_OUTLET_ID.')
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  requireConfiguration()
  const token = accessToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const body = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return body
}

export function hasStaffSession(): boolean {
  return Boolean(accessToken())
}

export async function signInStaff(employeeCode: string, pin: string): Promise<void> {
  requireConfiguration()
  if (!terminalId) throw new Error('Configure VITE_MEALY_TERMINAL_ID before staff sign-in.')
  const response = await fetch(`${apiBaseUrl}/v1/auth/staff-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outlet_id: outletId, terminal_id: terminalId, employee_code: employeeCode, pin }),
  })
  const body = await response.json() as { data?: { token: string }; error?: { message?: string } }
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  window.sessionStorage.setItem('mealy-access-token', body.data.token)
}

export async function signOutStaff(): Promise<void> {
  try { await apiRequest('/v1/auth/logout', { method: 'POST' }) } finally { window.sessionStorage.removeItem('mealy-access-token') }
}

export async function loadPosContext(): Promise<PosContext> {
  if (!terminalId) throw new Error('Configure VITE_MEALY_TERMINAL_ID.')
  const response = await apiRequest<{ data: PosContext }>(`/v1/pos/context?outlet_id=${encodeURIComponent(outletId)}&terminal_id=${encodeURIComponent(terminalId)}`)
  return response.data
}

export async function openPosShift(cashRegisterId: string, openingCashMinor: number): Promise<PosContext['open_shift']> {
  const response = await apiRequest<{ data: { shift: NonNullable<PosContext['open_shift']> } }>('/v1/pos/shifts', {
    method: 'POST', body: JSON.stringify({ cash_register_id: cashRegisterId, opening_cash_minor: openingCashMinor }),
  })
  return response.data.shift
}

type CatalogEnvelope = {
  data: {
    categories: Array<{ id: string; name: string }>
    items: Array<{
      id: string
      primary_category_id: string | null
      name: string
      short_description: string | null
      price_minor: string | number
      image_url: string | null
      is_available: boolean
    }>
  }
}

type OrdersEnvelope = {
  data: {
    orders: Array<{
      id: string
      public_number: string
      source_channel: string
      status_code: string
      total_minor: string | number
      customer_name_snapshot: string | null
      placed_at: string
      token_label: string | null
      items: Array<{ id: string; name: string; quantity: number }>
    }>
  }
}

type CreatedOrderSnapshot = {
  id: unknown
  public_number: unknown
  token_label?: unknown
  customer_name_snapshot?: unknown
  placed_at: unknown
  items?: Array<{ name?: unknown; quantity?: unknown }>
  total_minor: unknown
  status_code: unknown
}

function sourceLabel(source: string): PosOrder['source'] {
  if (source === 'student_web') return 'Student app'
  if (source === 'kiosk') return 'QR order'
  return 'Counter POS'
}

function statusLabel(status: string): PosOrder['status'] {
  const statuses: Record<string, PosOrder['status']> = {
    placed: 'New', confirmed: 'Accepted', preparing: 'Preparing', ready_for_pickup: 'Ready', collected: 'Collected',
    cancelled: 'Cancelled', rejected: 'Cancelled',
  }
  return statuses[status] ?? 'New'
}

export async function loadMenu(): Promise<MenuItem[]> {
  const response = await apiRequest<CatalogEnvelope>(`/v1/catalog/outlets/${encodeURIComponent(outletId)}`)
  const categories = new Map(response.data.categories.map((category) => [category.id, category.name]))
  return response.data.items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.primary_category_id ? (categories.get(item.primary_category_id) ?? 'Uncategorised') : 'Uncategorised',
    price: Number(item.price_minor),
    description: item.short_description ?? '',
    image: item.image_url ?? undefined,
    availability: item.is_available ? 'available' : 'sold-out',
  }))
}

export async function loadOrders(): Promise<PosOrder[]> {
  const response = await apiRequest<OrdersEnvelope>(`/v1/orders?outlet_id=${encodeURIComponent(outletId)}&limit=100`)
  return response.data.orders.map((order) => ({
    id: order.id,
    displayId: order.public_number,
    token: order.token_label ?? 'Pending',
    customer: order.customer_name_snapshot ?? 'Counter customer',
    source: sourceLabel(order.source_channel),
    placedAt: new Date(order.placed_at).toLocaleString(),
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    total: Number(order.total_minor),
    status: statusLabel(order.status_code),
  }))
}

export async function createCounterOrder(lines: CartLine[], note: string): Promise<PosOrder> {
  if (!counterId) throw new Error('Configure VITE_MEALY_COUNTER_ID before creating counter orders.')
  const response = await apiRequest<{ data: { order: CreatedOrderSnapshot } }>('/v1/orders', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      outlet_id: outletId,
      counter_id: counterId,
      ...(terminalId ? { terminal_id: terminalId } : {}),
      channel: 'pos',
      customer_name: 'Counter customer',
      ...(note ? { customer_note: note } : {}),
      items: lines.map((line) => ({ item_id: line.item.id, quantity: line.quantity, modifier_option_ids: [] })),
    }),
  })
  const order = response.data.order
  return {
    id: String(order.id),
    displayId: String(order.public_number),
    token: String(order.token_label ?? 'Pending'),
    customer: String(order.customer_name_snapshot ?? 'Counter customer'),
    source: 'Counter POS',
    placedAt: new Date(String(order.placed_at)).toLocaleString(),
    items: Array.isArray(order.items) ? order.items.map((item) => ({ name: String(item.name), quantity: Number(item.quantity) })) : [],
    total: Number(order.total_minor),
    status: statusLabel(String(order.status_code)),
  }
}

export async function createOfflineCashOrder(lines: CartLine[], note: string, context: PosContext): Promise<PosOrder> {
  if (!gatewayUrl) throw new Error('The outlet gateway is not configured on this POS.')
  if (!context.open_shift) throw new Error('Open a cash shift before accepting offline cash orders.')
  const cash = context.payment_methods.find((method) => method.method_code === 'cash')
  if (!cash) throw new Error('Cash is not configured for this outlet.')
  const total = lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0)
  const response = await fetch(`${gatewayUrl}/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
      ...(gatewayToken ? { 'x-mealy-gateway-token': gatewayToken } : {}),
    },
    body: JSON.stringify({
      source: 'Counter POS',
      promisedMinutes: 15,
      ...(note ? { customerNote: note } : {}),
      items: lines.map((line) => ({
        catalogItemId: line.item.id,
        name: line.item.name,
        quantity: line.quantity,
        unitPriceMinor: line.item.price,
        ...(note ? { note } : {}),
      })),
      commercial: {
        counterId: context.context.counter_id,
        terminalId: context.context.terminal_id,
        shiftId: context.open_shift.id,
        staffUserId: context.user.id,
        paymentMethodConfigId: cash.id,
        currencyCode: context.context.currency_code,
        subtotalMinor: total,
        totalMinor: total,
      },
    }),
  })
  const body = await response.json() as { data?: { ticket: { id: string; orderId: string; orderNumber: string; token: string; receivedAt: string; items: Array<{ name: string; quantity: number }> } }; error?: { message?: string } }
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? `Outlet gateway returned HTTP ${response.status}`)
  const ticket = body.data.ticket
  return { id: ticket.orderId, displayId: ticket.orderNumber, token: ticket.token, customer: 'Counter customer', source: 'Counter POS', placedAt: new Date(ticket.receivedAt).toLocaleString(), items: ticket.items.map((item) => ({ name: item.name, quantity: item.quantity })), total, status: 'New' }
}

export async function setItemAvailability(itemId: string, isAvailable: boolean): Promise<void> {
  await apiRequest(`/v1/catalog/outlets/${encodeURIComponent(outletId)}/items/${encodeURIComponent(itemId)}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ is_available: isAvailable }),
  })
}

export async function transitionOrder(orderId: string, toStatus: string): Promise<void> {
  await apiRequest(`/v1/orders/${encodeURIComponent(orderId)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ to_status: toStatus }),
  })
}

export async function cancelOrder(orderId: string, note: string): Promise<void> {
  await apiRequest(`/v1/orders/${encodeURIComponent(orderId)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ to_status: 'cancelled', reason_code: 'customer_request', note }),
  })
}

export async function refundOrder(orderId: string, note: string, externalReference?: string): Promise<void> {
  await apiRequest(`/v1/pos/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ reason_code: 'customer_request', note, ...(externalReference ? { external_reference: externalReference } : {}) }),
  })
}

export async function settleCounterOrder(
  orderId: string,
  shiftId: string | undefined,
  tenders: Array<{ payment_method_config_id: string; amount_minor: number; reference?: string }>,
): Promise<Receipt | null> {
  const response = await apiRequest<{ data: { receipt: Receipt | null } }>(`/v1/pos/orders/${encodeURIComponent(orderId)}/settle`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ shift_id: shiftId, tenders, issue_receipt: true }),
  })
  return response.data.receipt
}

export async function loadReceipt(orderId: string): Promise<{ receipt: Receipt; order: Record<string, unknown> }> {
  const response = await apiRequest<{ data: { receipt: Receipt; order: Record<string, unknown> } }>(`/v1/pos/orders/${encodeURIComponent(orderId)}/receipt`)
  return response.data
}
