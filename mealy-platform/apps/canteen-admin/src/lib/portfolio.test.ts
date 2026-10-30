import { describe, expect, it } from 'vitest'
import { aggregatePortfolio } from './portfolio'
import type { Canteen, MenuItem, Order } from '../types'

const canteens: Canteen[] = [
  { id: 'canteen-a', name: 'A', campus: 'Campus', outlets: 2, status: 'open', orders: 10, orderValue: 1000, avgPrep: 12 },
  { id: 'canteen-b', name: 'B', campus: 'Campus', outlets: 1, status: 'open', orders: 5, orderValue: 600, avgPrep: 8 },
]
const orders: Order[] = [
  { id: 'order-a', canteenId: 'canteen-a', token: '1', customer: 'One', source: 'Counter POS', value: 100, items: 1, status: 'Collected', time: 'now' },
]
const items: MenuItem[] = [
  { id: 'item-a', canteenId: 'canteen-a', name: 'Item', category: 'Food', price: 100, foodType: 'Veg', available: false, stock: 0, prepMinutes: 5 },
]

describe('portfolio aggregation', () => {
  it('combines all assigned canteens for the main view', () => {
    const result = aggregatePortfolio(canteens, orders, items, 'all')
    expect(result.orders).toBe(15)
    expect(result.orderValue).toBe(1600)
    expect(result.activeOutlets).toBe(3)
  })

  it('isolates one canteen when selected', () => {
    const result = aggregatePortfolio(canteens, orders, items, 'canteen-a')
    expect(result.orders).toBe(10)
    expect(result.orderValue).toBe(1000)
    expect(result.unavailableItems).toBe(1)
  })
})
