import { describe, expect, it } from 'vitest'
import type { KitchenTicket } from '../types'
import {
  areAllItemsReady,
  getElapsedMinutes,
  getReadyItemCount,
  getTicketCounts,
  getUrgency,
  moveTicket,
  setTicketItemReady,
  sortTickets,
} from './tickets'

const baseTicket: KitchenTicket = {
  id: 'ticket-1',
  kotNumber: 'KOT-1',
  orderNumber: 'ORD-1',
  token: 'A-1',
  source: 'Counter POS',
  status: 'new',
  receivedAt: '2026-10-11T06:00:00.000Z',
  promisedMinutes: 10,
  items: [{ id: 'item-1', name: 'Dosa', quantity: 1, status: 'pending' }],
}

describe('KDS ticket helpers', () => {
  it('measures elapsed time and urgency from the promised time', () => {
    const now = new Date('2026-10-11T06:11:00.000Z').getTime()
    expect(getElapsedMinutes(baseTicket, now)).toBe(11)
    expect(getUrgency(baseTicket, now)).toBe('late')
  })

  it('only permits the approved forward ticket transitions', () => {
    const preparing = moveTicket(baseTicket, 'preparing')
    expect(preparing.status).toBe('preparing')
    expect(() => moveTicket(preparing, 'ready')).toThrow('Every item')
    const itemReady = setTicketItemReady(preparing, 'item-1', true)
    expect(moveTicket(itemReady, 'ready').status).toBe('ready')
    expect(() => moveTicket(baseTicket, 'ready')).toThrow('Cannot move')
  })

  it('tracks item readiness independently and supports correcting a tap', () => {
    const preparing = moveTicket(baseTicket, 'preparing')
    const itemReady = setTicketItemReady(preparing, 'item-1', true)
    expect(getReadyItemCount(itemReady)).toBe(1)
    expect(areAllItemsReady(itemReady)).toBe(true)

    const corrected = setTicketItemReady(itemReady, 'item-1', false)
    expect(getReadyItemCount(corrected)).toBe(0)
    expect(areAllItemsReady(corrected)).toBe(false)
  })

  it('orders priority tickets first within a lane and counts every lane', () => {
    const priority = { ...baseTicket, id: 'ticket-2', priority: true }
    const ready = { ...baseTicket, id: 'ticket-3', status: 'ready' as const }
    expect(sortTickets([baseTicket, ready, priority]).map((ticket) => ticket.id)).toEqual([
      'ticket-2',
      'ticket-1',
      'ticket-3',
    ])
    expect(getTicketCounts([baseTicket, ready, priority])).toEqual({ new: 2, preparing: 0, ready: 1 })
  })
})
