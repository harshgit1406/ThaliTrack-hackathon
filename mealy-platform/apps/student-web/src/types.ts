export type CatalogCategory = { id: string; name: string; sort_order: number }

export type CatalogItem = {
  id: string
  primary_category_id: string | null
  name: string
  short_description: string | null
  food_type: string | null
  price_minor: string | number
  currency_code: string
  is_customizable: boolean
  preparation_minutes: number
  image_url: string | null
  is_available: boolean
  variants: Array<{ id: string; name: string; price_minor: string | number; is_default: boolean; is_available: boolean }>
}

export type OutletCatalog = {
  outlet: {
    id: string
    name: string
    currency_code: string
    accepts_orders: boolean
    preparation_lead_minutes: number
    canteen_id: string
    canteen_name: string
    counter_id: string | null
  }
  categories: CatalogCategory[]
  items: CatalogItem[]
}

export type DiscoveryOutlet = {
  id: string
  name: string
  canteen_id: string
  canteen_name: string
  accepts_orders: boolean
  preparation_lead_minutes: number
  counter_id: string | null
  counter_name: string | null
}

export type DiscoveryCampus = {
  id: string
  name: string
  latitude: string | number | null
  longitude: string | number | null
  distance_km: string | number | null
  outlets: DiscoveryOutlet[]
}

export type StudentSession = { user: { id?: string; userId?: string; display_name?: string; displayName?: string; phone_e164?: string; phone?: string }; token: string; expires_at: string }

export type PickupSlot = { id: string; starts_at: string; ends_at: string; capacity: number; order_count: number; remaining_capacity: number; status: string }

export type QueueStatus = { active_orders: number; ready_orders: number; estimated_wait_minutes: number; generated_at: string; rush_windows: Array<{ label: string; lecture_ends_at: string; expected_multiplier: string | number }> }

export type SurplusOffer = { id: string; item_id: string; name: string; quantity_available: number; discount_percent: number; base_price_minor: string | number; discounted_price_minor: string | number; starts_at: string; ends_at: string; status: string }

export type StudentOrder = { id: string; public_number: string; status_code: string; token_label: string | null; total_minor: string | number; currency_code: string; outlet_id: string; promised_at?: string | null; pickup_starts_at?: string | null; pickup_ends_at?: string | null; items: Array<{ id: string; name: string; quantity: number }> }

export type CartLine = {
  item: CatalogItem
  variantId?: string
  quantity: number
  note?: string
}

export type Quote = {
  currency_code: string
  subtotal_minor: number
  discount_total_minor: number
  tax_total_minor: number
  charge_total_minor: number
  total_minor: number
  expires_at: string
}
