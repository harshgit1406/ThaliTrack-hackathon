export type AppMode = 'main' | 'advanced'
export type MainView = 'overview' | 'records' | 'reports' | 'alerts'
export type AdvancedView = 'menu' | 'inventory' | 'outlets' | 'kitchen' | 'devices' | 'team' | 'taxes' | 'modules' | 'activity' | 'settings'
export type OwnerView = MainView | AdvancedView

export interface Canteen {
  id: string
  name: string
  campus: string
  outlets: number
  status: 'open' | 'busy' | 'paused'
  orders: number
  orderValue: number
  avgPrep: number
}

export interface Order {
  id: string
  canteenId: string
  token: string
  customer: string
  source: 'Student app' | 'Counter POS' | 'QR order'
  value: number
  items: number
  status: 'New' | 'Preparing' | 'Ready' | 'Collected' | 'Cancelled'
  time: string
}

export interface MenuItem {
  id: string
  canteenId: string
  name: string
  category: string
  price: number
  foodType: 'Veg' | 'Non-veg' | 'Vegan' | 'Egg'
  available: boolean
  stock: number
  prepMinutes: number
}

export interface Outlet {
  id: string
  canteenId: string
  name: string
  hours: string
  counters: number
  terminals: number
  acceptingOrders: boolean
}

export interface BusinessHour {
  outletId: string
  dayOfWeek: number
  opensAt: string
  closesAt: string
  isOpen: boolean
  orderingOpensMinutesBefore: number
  orderingClosesMinutesBefore: number
}

export interface ServiceCounter { id: string; outletId: string; code: string; name: string; status: string }
export interface TaxCategory { id: string; code: string; name: string }
export interface TaxRate {
  id: string; code: string; name: string; authority: string; ratePercent: number
  priceInclusive: boolean; status: 'active' | 'inactive'; taxCategoryIds: string[]
}
export interface PosTerminal { id: string; outletId: string; counterId?: string; code: string; name: string; status: 'pending' | 'active' | 'blocked' | 'retired'; lastSeenAt?: string; appVersion?: string }
export interface KitchenStation { id: string; outletId: string; code: string; name: string; status: 'active' | 'inactive' | 'archived'; displayOrder: number }
export interface Printer { id: string; outletId: string; code: string; name: string; printerType: 'network' | 'usb' | 'bluetooth' | 'system' | 'cloud'; queue: string; paperWidthMm: 58 | 76 | 80; status: 'active' | 'offline' | 'disabled' | 'retired'; lastSeenAt?: string }

export interface RushOrder { id: string; public_number: string; status_code: string; customer_name_snapshot: string; token_label: string | null; pickup_slot_id: string | null; starts_at: string | null; ends_at: string | null; items: Array<{ name: string; quantity: number }> }
export interface RushBoard { orders: RushOrder[]; slots: Array<{ id: string; starts_at: string; ends_at: string; capacity: number; order_count: number }>; generated_at: string }
export interface DishForecast { catalog_item_id: string; name: string; recommendedQuantity: number; rawPrediction: number; confidence: number; estimatedFoodSavedKg: number; explanation: string; history: Array<{ serviceDate: string; quantityOrdered: number; leftoverKg: number }> }
export interface ForecastReport { target_date: string; rush_multiplier: number; dishes: DishForecast[]; estimated_food_saved_kg: number; model: string }
export interface PrinterRoute { id: string; outletId: string; printerId: string; documentType: 'kot' | 'bill' | 'receipt' | 'token' | 'summary'; kitchenStationId?: string; terminalId?: string; copies: number; isActive: boolean }
export interface OutletGateway { id: string; outletId: string; gatewayKey: string; displayName: string; status: 'pending' | 'active' | 'blocked' | 'retired'; lastConnectedAt?: string; lastSeenAt?: string; appVersion?: string }

export interface ManagementSetup {
  businessHours: BusinessHour[]
  counters: ServiceCounter[]
  taxCategories: TaxCategory[]
  taxRates: TaxRate[]
  terminals: PosTerminal[]
  kitchenStations: KitchenStation[]
  printers: Printer[]
  printerRoutes: PrinterRoute[]
  gateways: OutletGateway[]
}

export interface TeamMember {
  id: string
  canteenIds: string[]
  name: string
  initials: string
  role: string
  scope: string
  status: 'Active' | 'Invited' | 'Suspended'
  lastSeen: string
}

export interface OwnerAlert {
  id: string
  canteenId: string
  level: 'warning' | 'info'
  title: string
  detail: string
  age: string
}

export interface OwnerActivity {
  id: string
  canteenId: string
  actor: string
  action: string
  target: string
  time: string
}
