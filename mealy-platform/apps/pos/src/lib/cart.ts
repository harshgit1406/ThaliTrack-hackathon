import type { CartLine, MenuItem } from '../types'

export function updateCartQuantity(lines: CartLine[], item: MenuItem, change: number): CartLine[] {
  const existing = lines.find((line) => line.item.id === item.id)
  if (!existing && change > 0) return [...lines, { item, quantity: change }]
  if (!existing) return lines

  const nextQuantity = existing.quantity + change
  return nextQuantity <= 0
    ? lines.filter((line) => line.item.id !== item.id)
    : lines.map((line) => line.item.id === item.id ? { ...line, quantity: nextQuantity } : line)
}

export function getBillSubtotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.item.price * line.quantity, 0)
}

export function getItemCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0)
}
