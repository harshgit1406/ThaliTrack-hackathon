import { describe, expect, it } from 'vitest'
import { getBillSubtotal, getItemCount, updateCartQuantity } from './cart'
import type { CartLine, MenuItem } from '../types'

const burger: MenuItem = {
  id: 'burger',
  name: 'Veg Burger',
  category: 'Popular',
  price: 6000,
  description: 'Test item',
  image: '/burger.jpg',
  availability: 'available',
}

describe('cart operations', () => {
  it('adds, updates, and removes a line without mutating the current bill', () => {
    const initial: CartLine[] = []
    const oneBurger = updateCartQuantity(initial, burger, 1)
    const threeBurgers = updateCartQuantity(oneBurger, burger, 2)
    const removed = updateCartQuantity(threeBurgers, burger, -3)

    expect(initial).toEqual([])
    expect(oneBurger).toEqual([{ item: burger, quantity: 1 }])
    expect(threeBurgers[0].quantity).toBe(3)
    expect(removed).toEqual([])
  })

  it('calculates totals from minor-unit prices', () => {
    const bill = [{ item: burger, quantity: 2 }]
    expect(getItemCount(bill)).toBe(2)
    expect(getBillSubtotal(bill)).toBe(12000)
  })
})
