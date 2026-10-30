export type Availability = 'available' | 'low-stock' | 'sold-out'

export type MenuItem = {
  id: string
  name: string
  category: string
  price: number
  description: string
  image?: string
  availability: Availability
  remaining?: number
}

export type CartLine = {
  item: MenuItem
  quantity: number
}

export type Toast = {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
}

export type PosView = 'new-bill' | 'online-orders' | 'active-tokens' | 'history'

export type OrderStatus = 'New' | 'Accepted' | 'Preparing' | 'Ready' | 'Collected' | 'Cancelled'

export type PosOrder = {
  id: string
  displayId: string
  token: string
  customer: string
  source: 'Student app' | 'QR order' | 'Counter POS'
  placedAt: string
  items: Array<{ name: string; quantity: number }>
  total: number
  status: OrderStatus
}
