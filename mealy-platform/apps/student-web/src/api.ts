import type { CartLine, DiscoveryCampus, OutletCatalog, PickupSlot, QueueStatus, Quote, StudentOrder, StudentSession, SurplusOffer } from './types'

const apiBaseUrl = (import.meta.env.VITE_MEALY_API_BASE_URL ?? '').trim().replace(/\/$/, '')
const outletId = (import.meta.env.VITE_MEALY_OUTLET_ID ?? '').trim()
const sessionKey = 'mealy-student-session-v1'

export function configuredOutletId(): string {
  return new URLSearchParams(window.location.search).get('outlet')?.trim() || outletId
}

export function readSession(): StudentSession | null { try { return JSON.parse(localStorage.getItem(sessionKey) ?? 'null') as StudentSession | null } catch { return null } }
export function saveSession(session: StudentSession | null): void { if (session) localStorage.setItem(sessionKey, JSON.stringify(session)); else localStorage.removeItem(sessionKey) }

function configured(): void {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL to connect to Mealy.')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  configured()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(readSession()?.token ? { authorization: `Bearer ${readSession()!.token}` } : {}), ...init?.headers },
  })
  const body = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return body
}

export async function getCatalog(id = outletId, signal?: AbortSignal): Promise<OutletCatalog> {
  if (!id) throw new Error('Choose a canteen to load its live menu.')
  const response = await request<{ data: OutletCatalog }>(`/v1/catalog/outlets/${id}`, { signal })
  return response.data
}

export async function getQuote(lines: CartLine[]): Promise<Quote> {
  const activeOutletId = configuredOutletId()
  if (!activeOutletId) throw new Error('Choose a canteen before requesting a quote.')
  const response = await request<{ data: { quote: Quote } }>('/v1/pricing/quote', {
    method: 'POST',
    body: JSON.stringify({
      outlet_id: activeOutletId,
      channel: 'student_web',
      items: lines.map((line) => ({ item_id: line.item.id, variant_id: line.variantId, quantity: line.quantity, notes: line.note, modifier_option_ids: [] })),
    }),
  })
  return response.data.quote
}

export async function getDiscovery(latitude?: number, longitude?: number): Promise<DiscoveryCampus[]> {
  const query = latitude === undefined || longitude === undefined ? '' : `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
  return (await request<{ data: { campuses: DiscoveryCampus[] } }>(`/v1/student/discovery${query}`)).data.campuses
}

export async function requestOtp(phone: string): Promise<{ challenge_id: string; expires_at: string }> { return (await request<{ data: { challenge_id: string; expires_at: string } }>('/v1/student/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) })).data }
export async function verifyOtp(input: { challenge_id: string; phone: string; code: string; display_name?: string }): Promise<StudentSession> { return (await request<{ data: StudentSession }>('/v1/student/auth/otp/verify', { method: 'POST', body: JSON.stringify(input) })).data }
export async function getOrders(): Promise<StudentOrder[]> { return (await request<{ data: { orders: StudentOrder[] } }>('/v1/orders')).data.orders }
export async function getOrder(orderId: string): Promise<StudentOrder> { return (await request<{ data: { order: StudentOrder } }>(`/v1/orders/${orderId}`)).data.order }

export async function createDemoSession(role: 'student_aarav' | 'student_meera' | 'manager'): Promise<StudentSession> {
  return (await request<{ data: StudentSession }>('/v1/auth/demo-session', { method: 'POST', body: JSON.stringify({ role }) })).data
}

export async function getPickupSlots(): Promise<PickupSlot[]> {
  const id = configuredOutletId()
  return (await request<{ data: { slots: PickupSlot[] } }>(`/v1/student/outlets/${id}/pickup-slots`)).data.slots
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const id = configuredOutletId()
  return (await request<{ data: QueueStatus }>(`/v1/student/outlets/${id}/queue-status`)).data
}

export async function getSurplusOffers(): Promise<SurplusOffer[]> {
  const id = configuredOutletId()
  return (await request<{ data: { offers: SurplusOffer[] } }>(`/v1/student/outlets/${id}/surplus-offers`)).data.offers
}

export async function createStudentOrder(lines: CartLine[], pickupSlotId: string, counterId: string): Promise<StudentOrder> {
  const idempotencyKey = crypto.randomUUID()
  const response = await request<{ data: { order: StudentOrder } }>('/v1/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({
      outlet_id: configuredOutletId(), counter_id: counterId, channel: 'student_web', pickup_slot_id: pickupSlotId, payment_mode: 'mock_upi',
      items: lines.map((line) => ({ item_id: line.item.id, variant_id: line.variantId, quantity: line.quantity, notes: line.note, modifier_option_ids: [] })),
    }),
  })
  return response.data.order
}
