import type { KitchenTicket, TicketStatus } from '../types'

const statusOrder: Record<TicketStatus, number> = { new: 0, preparing: 1, ready: 2 }

export function getElapsedMinutes(ticket: KitchenTicket, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(ticket.receivedAt).getTime()) / 60_000))
}

export function getUrgency(ticket: KitchenTicket, now = Date.now()): 'on-time' | 'warning' | 'late' {
  if (ticket.status === 'ready') return 'on-time'
  const elapsed = getElapsedMinutes(ticket, now)
  if (elapsed >= ticket.promisedMinutes) return 'late'
  if (elapsed >= Math.max(1, ticket.promisedMinutes - 3)) return 'warning'
  return 'on-time'
}

export function sortTickets(tickets: KitchenTicket[]): KitchenTicket[] {
  return [...tickets].sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status]
    if (Boolean(a.priority) !== Boolean(b.priority)) return a.priority ? -1 : 1
    return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  })
}

export function getReadyItemCount(ticket: KitchenTicket): number {
  return ticket.items.filter((item) => item.status === 'ready').length
}

export function areAllItemsReady(ticket: KitchenTicket): boolean {
  return ticket.items.length > 0 && getReadyItemCount(ticket) === ticket.items.length
}

export function setTicketItemReady(ticket: KitchenTicket, itemId: string, ready: boolean): KitchenTicket {
  if (ticket.status !== 'preparing') throw new Error('Items can only be updated while a ticket is preparing')
  if (!ticket.items.some((item) => item.id === itemId)) throw new Error('Ticket item was not found')

  return {
    ...ticket,
    items: ticket.items.map((item) =>
      item.id === itemId ? { ...item, status: ready ? 'ready' : 'pending' } : item,
    ),
  }
}

export function moveTicket(ticket: KitchenTicket, nextStatus: TicketStatus): KitchenTicket {
  const allowed =
    (ticket.status === 'new' && nextStatus === 'preparing') ||
    (ticket.status === 'preparing' && nextStatus === 'ready')

  if (!allowed) throw new Error(`Cannot move ${ticket.status} ticket to ${nextStatus}`)
  if (nextStatus === 'ready' && !areAllItemsReady(ticket)) {
    throw new Error('Every item must be ready before the order can be marked ready')
  }
  return { ...ticket, status: nextStatus }
}

export function getTicketCounts(tickets: KitchenTicket[]): Record<TicketStatus, number> {
  return tickets.reduce<Record<TicketStatus, number>>(
    (counts, ticket) => ({ ...counts, [ticket.status]: counts[ticket.status] + 1 }),
    { new: 0, preparing: 0, ready: 0 },
  )
}
