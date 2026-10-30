import { describe, expect, it } from 'vitest'
import { hoursSummary } from './lib/setup'
import type { ManagementSetup } from './types'

const emptySetup: ManagementSetup = {
  businessHours: [], counters: [], taxCategories: [], taxRates: [], terminals: [],
  kitchenStations: [], printers: [], printerRoutes: [], gateways: [],
}

describe('business hour summaries', () => {
  it('shows the dominant schedule and open-day count', () => {
    const setup = { ...emptySetup, businessHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ outletId: 'outlet-a', dayOfWeek, opensAt: '09:00', closesAt: '18:00', isOpen: dayOfWeek > 0, orderingOpensMinutesBefore: 0, orderingClosesMinutesBefore: 0 })) }
    expect(hoursSummary(setup, 'outlet-a')).toBe('09:00–18:00 · 6 days')
  })

  it('clearly reports a fully closed outlet', () => {
    expect(hoursSummary(emptySetup, 'outlet-a')).toBe('Closed all week')
  })
})
