export type TicketStatus = 'new' | 'preparing' | 'ready'

export type OrderSource = 'Counter POS' | 'Student app' | 'QR order'

export type TicketItem = {
  id: string
  name: string
  quantity: number
  status: 'pending' | 'ready'
  modifiers?: string[]
  note?: string
}

export type KitchenTicket = {
  id: string
  kotNumber: string
  orderNumber: string
  token: string
  source: OrderSource
  status: TicketStatus
  receivedAt: string
  promisedMinutes: number
  priority?: boolean
  customerNote?: string
  items: TicketItem[]
}

export type GatewayState = 'connected' | 'reconnecting' | 'offline'

export type Toast = {
  id: number
  tone: 'success' | 'warning' | 'info'
  message: string
}
