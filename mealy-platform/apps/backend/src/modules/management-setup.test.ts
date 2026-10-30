import { describe, expect, it } from 'vitest'
import { businessHoursSchema } from './management-setup.js'

const week = Array.from({ length: 7 }, (_, day_of_week) => ({
  day_of_week,
  is_open: day_of_week > 0,
  opens_at: '09:00',
  closes_at: '18:00',
  ordering_opens_minutes_before: 0,
  ordering_closes_minutes_before: 0,
}))

describe('management setup validation', () => {
  it('accepts exactly one schedule entry for every day', () => {
    expect(businessHoursSchema.parse({ days: week }).days).toHaveLength(7)
  })

  it('rejects duplicate weekdays and zero-length opening windows', () => {
    expect(() => businessHoursSchema.parse({ days: week.map((day) => ({ ...day, day_of_week: 1 })) })).toThrow()
    expect(() => businessHoursSchema.parse({ days: week.map((day) => ({ ...day, closes_at: '09:00' })) })).toThrow()
  })
})
