/* Backend snapshot rows are normalized at this boundary before reaching the UI. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BusinessHour, Canteen, ForecastReport, KitchenStation, ManagementSetup, MenuItem, Order, Outlet, OwnerActivity, OwnerAlert, PosTerminal, Printer, PrinterRoute, RushBoard, TaxRate, TeamMember } from '../types'
import { createRequestId } from '../lib/request-id'

const apiBaseUrl = (import.meta.env.VITE_MEALY_API_BASE_URL ?? '').trim().replace(/\/$/, '')

function accessToken(): string {
  return window.sessionStorage.getItem('mealy-access-token')?.trim() ?? ''
}

export function hasManagementSession(): boolean { return Boolean(accessToken()) }

export async function createDemoManagementSession(): Promise<void> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const response = await fetch(`${apiBaseUrl}/v1/auth/demo-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'manager' }) })
  const body = await response.json() as { data?: { token: string }; error?: { message?: string } }
  if (!response.ok || !body.data?.token) throw new Error(body.error?.message ?? 'Demo manager sign-in failed.')
  window.sessionStorage.setItem('mealy-access-token', body.data.token)
}

async function authorized<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${accessToken()}`, ...init?.headers } })
  const body = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return body
}

export async function loadRushBoard(outletId: string): Promise<RushBoard> { return (await authorized<{ data: RushBoard }>(`/v1/management/outlets/${outletId}/rush-board`)).data }
export async function loadForecast(outletId: string): Promise<ForecastReport> { return (await authorized<{ data: ForecastReport }>(`/v1/management/outlets/${outletId}/forecast`)).data }
export async function transitionRushOrder(orderId: string, toStatus: 'confirmed' | 'preparing' | 'ready_for_pickup'): Promise<void> { await authorized(`/v1/orders/${orderId}/transitions`, { method: 'POST', body: JSON.stringify({ to_status: toStatus }) }) }
export async function logDishLeftover(outletId: string, itemId: string, leftoverKg: number): Promise<void> { await authorized(`/v1/management/outlets/${outletId}/leftovers`, { method: 'POST', body: JSON.stringify({ catalog_item_id: itemId, business_date: new Date().toISOString().slice(0, 10), leftover_kg: leftoverKg }) }) }
export async function publishSurplusOffer(outletId: string, itemId: string, quantity: number): Promise<void> { await authorized(`/v1/management/outlets/${outletId}/surplus-offers`, { method: 'POST', body: JSON.stringify({ catalog_item_id: itemId, quantity_available: quantity, discount_percent: 35 }) }) }

function source(value: string): Order['source'] {
  if (value === 'student_web') return 'Student app'
  if (value === 'kiosk') return 'QR order'
  return 'Counter POS'
}

function status(value: string): Order['status'] {
  const values: Record<string, Order['status']> = {
    placed: 'New', confirmed: 'New', preparing: 'Preparing', ready_for_pickup: 'Ready', collected: 'Collected', cancelled: 'Cancelled', rejected: 'Cancelled',
  }
  return values[value] ?? 'New'
}

function foodType(value: string): MenuItem['foodType'] {
  if (value === 'non_vegetarian') return 'Non-veg'
  if (value === 'vegan') return 'Vegan'
  if (value === 'egg') return 'Egg'
  return 'Veg'
}

function elapsed(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  return minutes < 60 ? `${minutes} min ago` : new Date(value).toLocaleString()
}

export type ManagementSnapshot = {
  canteens: Canteen[]
  orders: Order[]
  items: MenuItem[]
  outlets: Outlet[]
  team: TeamMember[]
  alerts: OwnerAlert[]
  activities: OwnerActivity[]
}

export async function loadManagementSnapshot(): Promise<ManagementSnapshot> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const token = accessToken()
  if (!token) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}/v1/management/snapshot`, { headers: { authorization: `Bearer ${token}` } })
  const body = await response.json() as { data?: Record<string, any>; error?: { message?: string } }
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  const data = body.data
  return {
    canteens: data.canteens.map((canteen: any) => ({
      id: canteen.id, name: canteen.name, campus: canteen.campus, outlets: Number(canteen.outlets),
      status: canteen.status === 'active' ? 'open' : canteen.status === 'onboarding' ? 'paused' : 'paused',
      orders: Number(canteen.orders), orderValue: Number(canteen.order_value) / 100, avgPrep: Number(canteen.average_prep),
    })),
    orders: data.orders.map((order: any) => ({
      id: order.public_number, canteenId: order.canteen_id, token: order.token_label ?? 'Pending',
      customer: order.customer_name_snapshot ?? 'Counter customer', source: source(order.source_channel),
      value: Number(order.total_minor) / 100, items: Number(order.item_count), status: status(order.status_code), time: elapsed(order.placed_at),
    })),
    items: data.items.map((item: any) => ({
      id: item.id, canteenId: item.canteen_id, name: item.name, category: item.category ?? 'Uncategorised',
      price: Number(item.base_price_minor) / 100, foodType: foodType(item.food_type), available: item.is_available,
      stock: Number(item.stock), prepMinutes: Number(item.preparation_minutes ?? 0),
    })),
    outlets: data.outlets.map((outlet: any) => ({
      id: outlet.id, canteenId: outlet.canteen_id, name: outlet.name, hours: 'Managed by backend schedule',
      counters: Number(outlet.counters), terminals: Number(outlet.terminals), acceptingOrders: outlet.accepts_orders,
    })),
    team: data.team.map((member: any) => ({
      id: member.id, canteenIds: [member.canteen_id], name: member.display_name,
      initials: member.display_name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
      role: member.role ?? 'Unassigned', scope: 'Assigned canteen', status: member.status === 'active' ? 'Active' : member.status === 'invited' ? 'Invited' : 'Suspended',
      lastSeen: member.last_seen_at ? elapsed(member.last_seen_at) : 'Never',
    })),
    alerts: data.alerts,
    activities: data.activities.map((entry: any) => ({
      id: entry.id, canteenId: entry.canteen_id, actor: entry.actor, action: entry.action,
      target: entry.target, time: new Date(entry.occurred_at).toLocaleString(),
    })),
  }
}

async function update(path: string, body: unknown): Promise<void> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const token = accessToken()
  if (!token) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const payload = await response.json() as { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message ?? `Mealy API returned HTTP ${response.status}`)
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const token = accessToken()
  if (!token) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json() as { data?: T; error?: { message?: string } }
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return payload.data
}

async function create<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const token = accessToken()
  if (!token) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': createRequestId() }, body: JSON.stringify(body),
  })
  const payload = await response.json() as { data?: T; error?: { message?: string } }
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return payload.data
}

export async function setMenuItemAvailability(canteenId: string, itemId: string, isAvailable: boolean): Promise<void> {
  await update(`/v1/management/canteens/${encodeURIComponent(canteenId)}/items/${encodeURIComponent(itemId)}/availability`, { is_available: isAvailable })
}

export async function setOutletAcceptingOrders(outletId: string, acceptsOrders: boolean): Promise<void> {
  await update(`/v1/management/outlets/${encodeURIComponent(outletId)}/accepting-orders`, { accepts_orders: acceptsOrders })
}

export async function createMenuItem(canteenId: string, item: Pick<MenuItem, 'name' | 'category' | 'price' | 'foodType' | 'prepMinutes'>): Promise<void> {
  const foodTypes: Record<MenuItem['foodType'], string> = { Veg: 'vegetarian', 'Non-veg': 'non_vegetarian', Vegan: 'vegan', Egg: 'egg' }
  await create(`/v1/management/canteens/${encodeURIComponent(canteenId)}/items`, {
    name: item.name, category: item.category, price_minor: Math.round(item.price * 100),
    food_type: foodTypes[item.foodType], preparation_minutes: item.prepMinutes,
  })
}

export async function createStaffMember(canteenId: string, input: {
  outletId?: string
  name: string
  email: string
  employeeCode: string
  roleCode: 'canteen_manager' | 'outlet_manager' | 'cashier' | 'kitchen'
  pin: string
}): Promise<void> {
  await create(`/v1/management/canteens/${encodeURIComponent(canteenId)}/staff`, {
    outlet_id: input.outletId, display_name: input.name, email: input.email,
    employee_code: input.employeeCode, role_code: input.roleCode, pin: input.pin,
  })
}

export async function adjustMenuItemStock(canteenId: string, itemId: string, outletId: string, quantityDelta: number, reason: string): Promise<void> {
  await create(`/v1/management/canteens/${encodeURIComponent(canteenId)}/items/${encodeURIComponent(itemId)}/stock-adjustments`, {
    outlet_id: outletId, quantity_delta: quantityDelta, reason,
  })
}

export async function loadManagementSetup(canteenId: string): Promise<ManagementSetup> {
  const data = await request<Record<string, any>>(`/v1/management/canteens/${encodeURIComponent(canteenId)}/setup`)
  return {
    businessHours: data.business_hours.map((entry: any) => ({ outletId: entry.outlet_id, dayOfWeek: entry.day_of_week, opensAt: String(entry.opens_at).slice(0, 5), closesAt: String(entry.closes_at).slice(0, 5), isOpen: entry.is_active, orderingOpensMinutesBefore: entry.ordering_opens_minutes_before, orderingClosesMinutesBefore: entry.ordering_closes_minutes_before })),
    counters: data.counters.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, code: entry.code, name: entry.name, status: entry.status })),
    taxCategories: data.tax_categories.map((entry: any) => ({ id: entry.id, code: entry.code, name: entry.name })),
    taxRates: data.tax_rates.map((entry: any) => ({ id: entry.id, code: entry.code, name: entry.name, authority: entry.authority ?? '', ratePercent: Number(entry.rate_basis_points) / 100, priceInclusive: entry.price_inclusive, status: entry.status, taxCategoryIds: entry.tax_category_ids })),
    terminals: data.terminals.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, counterId: entry.counter_id ?? undefined, code: entry.code, name: entry.name, status: entry.status, lastSeenAt: entry.last_seen_at ?? undefined, appVersion: entry.app_version ?? undefined })),
    kitchenStations: data.kitchen_stations.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, code: entry.code, name: entry.name, status: entry.status, displayOrder: entry.display_order })),
    printers: data.printers.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, code: entry.code, name: entry.name, printerType: entry.printer_type, queue: entry.connection_config?.queue ?? '', paperWidthMm: entry.paper_width_mm ?? 80, status: entry.status, lastSeenAt: entry.last_seen_at ?? undefined })),
    printerRoutes: data.printer_routes.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, printerId: entry.printer_id, documentType: entry.document_type, kitchenStationId: entry.kitchen_station_id ?? undefined, terminalId: entry.terminal_id ?? undefined, copies: entry.copies, isActive: entry.is_active })),
    gateways: data.gateways.map((entry: any) => ({ id: entry.id, outletId: entry.outlet_id, gatewayKey: entry.gateway_key, displayName: entry.display_name, status: entry.status, lastConnectedAt: entry.last_connected_at ?? undefined, lastSeenAt: entry.last_seen_at ?? undefined, appVersion: entry.app_version ?? undefined })),
  }
}

export async function saveBusinessHours(outletId: string, days: Array<Omit<BusinessHour, 'outletId'>>): Promise<void> {
  await request(`/v1/management/outlets/${encodeURIComponent(outletId)}/business-hours`, 'PUT', { days: days.map((day) => ({ day_of_week: day.dayOfWeek, is_open: day.isOpen, opens_at: day.opensAt, closes_at: day.closesAt, ordering_opens_minutes_before: day.orderingOpensMinutesBefore, ordering_closes_minutes_before: day.orderingClosesMinutesBefore })) })
}
export async function saveTaxRate(canteenId: string, value: Omit<TaxRate, 'id'>, id?: string): Promise<void> {
  await request(`/v1/management/canteens/${encodeURIComponent(canteenId)}/tax-rates${id ? `/${encodeURIComponent(id)}` : ''}`, id ? 'PUT' : 'POST', { code: value.code, name: value.name, authority: value.authority, rate_percent: value.ratePercent, price_inclusive: value.priceInclusive, status: value.status, tax_category_ids: value.taxCategoryIds })
}
export async function saveTerminal(outletId: string, value: Omit<PosTerminal, 'id' | 'outletId'>, id?: string): Promise<void> { await request(`/v1/management/outlets/${outletId}/terminals${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', { code: value.code, name: value.name, counter_id: value.counterId ?? null, status: value.status }) }
export async function saveKitchenStation(outletId: string, value: Omit<KitchenStation, 'id' | 'outletId' | 'displayOrder'>, id?: string): Promise<void> { await request(`/v1/management/outlets/${outletId}/kitchen-stations${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', value) }
export async function savePrinter(outletId: string, value: Omit<Printer, 'id' | 'outletId'>, id?: string): Promise<void> { await request(`/v1/management/outlets/${outletId}/printers${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', { code: value.code, name: value.name, printer_type: value.printerType, queue: value.queue, paper_width_mm: value.paperWidthMm, status: value.status }) }
export async function createPrinterRoute(outletId: string, value: Omit<PrinterRoute, 'id' | 'outletId' | 'isActive'>): Promise<void> { await request(`/v1/management/outlets/${outletId}/printer-routes`, 'POST', { printer_id: value.printerId, document_type: value.documentType, kitchen_station_id: value.kitchenStationId ?? null, terminal_id: value.terminalId ?? null, copies: value.copies }) }
export async function deletePrinterRoute(outletId: string, routeId: string): Promise<void> { await request(`/v1/management/outlets/${outletId}/printer-routes/${routeId}`, 'DELETE') }
export async function enrollGateway(outletId: string, gatewayKey: string, displayName: string): Promise<{ gateway: { id: string }; enrollment_token: string }> { return request(`/v1/management/outlets/${outletId}/gateways`, 'POST', { gateway_key: gatewayKey, display_name: displayName }) }
export async function rotateGatewayToken(outletId: string, gatewayId: string): Promise<{ gateway: { id: string }; enrollment_token: string }> { return request(`/v1/management/outlets/${outletId}/gateways/${gatewayId}/rotate-token`, 'POST', {}) }
