import type { Canteen, MenuItem, Order } from '../types'

export function aggregatePortfolio(canteens: Canteen[], orders: Order[], items: MenuItem[], canteenId: string) {
  const scopedCanteens = canteenId === 'all' ? canteens : canteens.filter((canteen) => canteen.id === canteenId)
  const ids = new Set(scopedCanteens.map((canteen) => canteen.id))
  const scopedOrders = orders.filter((order) => ids.has(order.canteenId))
  const scopedItems = items.filter((item) => ids.has(item.canteenId))
  const collected = scopedOrders.filter((order) => order.status === 'Collected')
  return {
    orders: scopedCanteens.reduce((sum, canteen) => sum + canteen.orders, 0),
    orderValue: scopedCanteens.reduce((sum, canteen) => sum + canteen.orderValue, 0),
    averagePrep: scopedCanteens.length ? Math.round(scopedCanteens.reduce((sum, canteen) => sum + canteen.avgPrep, 0) / scopedCanteens.length) : 0,
    activeOutlets: scopedCanteens.reduce((sum, canteen) => sum + canteen.outlets, 0),
    averageOrderValue: collected.length ? Math.round(collected.reduce((sum, order) => sum + order.value, 0) / collected.length) : 0,
    unavailableItems: scopedItems.filter((item) => !item.available).length,
    lowStockItems: scopedItems.filter((item) => item.stock > 0 && item.stock <= 12).length,
  }
}
