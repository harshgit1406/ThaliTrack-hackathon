import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartLine, CatalogItem } from './types'

const storageKey = 'mealy-student-cart-v1'
type CartContextValue = {
  lines: CartLine[]
  count: number
  add: (item: CatalogItem, variantId?: string, note?: string) => void
  update: (itemId: string, variantId: string | undefined, note: string | undefined, quantity: number) => void
  remove: (itemId: string, variantId?: string, note?: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as CartLine[] } catch { return [] }
  })

  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(lines)) }, [lines])

  const value = useMemo<CartContextValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    add: (item, variantId, note) => setLines((current) => {
      const normalizedNote = note?.trim() || undefined
      const existing = current.find((line) => line.item.id === item.id && line.variantId === variantId && line.note === normalizedNote)
      return existing ? current.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { item, variantId, note: normalizedNote, quantity: 1 }]
    }),
    update: (itemId, variantId, note, quantity) => setLines((current) => quantity < 1 ? current.filter((line) => !(line.item.id === itemId && line.variantId === variantId && line.note === note)) : current.map((line) => line.item.id === itemId && line.variantId === variantId && line.note === note ? { ...line, quantity } : line)),
    remove: (itemId, variantId, note) => setLines((current) => current.filter((line) => !(line.item.id === itemId && line.variantId === variantId && line.note === note))),
    clear: () => setLines([]),
  }), [lines])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
