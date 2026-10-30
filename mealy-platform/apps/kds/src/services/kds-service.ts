import type { GatewayState, KitchenTicket, TicketStatus } from '../types'

const gatewayUrl = (import.meta.env.VITE_MEALY_GATEWAY_URL ?? '').trim().replace(/\/$/, '')
const gatewayToken = (import.meta.env.VITE_MEALY_GATEWAY_TOKEN ?? '').trim()

export const isOutletGatewayConfigured = gatewayUrl.length > 0

type TicketEnvelope = { data: { ticket: KitchenTicket } }
type QueueEnvelope = { data: { tickets: KitchenTicket[] } }

async function gatewayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!gatewayUrl) throw new Error('Configure VITE_MEALY_GATEWAY_URL. The KDS does not use demo tickets.')
  const response = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(gatewayToken ? { 'x-mealy-gateway-token': gatewayToken } : {}),
      ...init?.headers,
    },
  })
  const body = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Outlet gateway returned HTTP ${response.status}`)
  return body
}

export async function loadKitchenQueue(): Promise<KitchenTicket[]> {
  const response = await gatewayRequest<QueueEnvelope>('/v1/kitchen/tickets')
  return response.data.tickets
}

export async function updateTicketStatus(
  ticket: KitchenTicket,
  nextStatus: TicketStatus,
  gatewayState: GatewayState,
): Promise<KitchenTicket> {
  if (gatewayState !== 'connected') {
    throw new Error('The outlet gateway is unavailable. Reconnect before updating this ticket.')
  }

  const action = nextStatus === 'preparing' ? 'start' : 'ready'
  const response = await gatewayRequest<TicketEnvelope>(`/v1/kitchen/tickets/${encodeURIComponent(ticket.id)}/${action}`, { method: 'POST' })
  return response.data.ticket
}

export async function updateTicketItemReadiness(
  ticket: KitchenTicket,
  itemId: string,
  ready: boolean,
  gatewayState: GatewayState,
): Promise<KitchenTicket> {
  if (gatewayState !== 'connected') {
    throw new Error('The outlet gateway is unavailable. Reconnect before updating this item.')
  }

  const response = await gatewayRequest<TicketEnvelope>(
    `/v1/kitchen/tickets/${encodeURIComponent(ticket.id)}/items/${encodeURIComponent(itemId)}/readiness`,
    { method: 'POST', body: JSON.stringify({ ready }) },
  )
  return response.data.ticket
}

export async function delayKitchenTicket(ticketId: string, minutes: number, reason: string): Promise<KitchenTicket> {
  const response = await gatewayRequest<TicketEnvelope>(`/v1/kitchen/tickets/${encodeURIComponent(ticketId)}/delay`, {
    method: 'POST', body: JSON.stringify({ minutes, reason }),
  })
  return response.data.ticket
}

export async function remakeKitchenTicket(ticketId: string, reason: string): Promise<KitchenTicket> {
  const response = await gatewayRequest<TicketEnvelope>(`/v1/kitchen/tickets/${encodeURIComponent(ticketId)}/remake`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
  return response.data.ticket
}
