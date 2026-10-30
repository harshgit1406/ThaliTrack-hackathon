import { describe, expect, it } from 'vitest'
import { forecastDish } from './forecast-model.js'

describe('ThaliTrack forecast model', () => {
  it('returns a bounded explainable forecast and food-saved estimate', () => {
    const points = Array.from({ length: 28 }, (_, index) => ({
      serviceDate: new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
      quantityOrdered: 30 + (index % 7) * 3 + Math.floor(index / 7), leftoverKg: index < 21 ? 2.5 : 1.2,
      portionWeightKg: 0.3, rushIndex: index % 7 < 5 ? 1.35 : 0.85,
    }))
    const result = forecastDish(points, '2026-10-30', 1.4)
    expect(result.recommendedQuantity).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThanOrEqual(0.35)
    expect(result.confidence).toBeLessThanOrEqual(0.96)
    expect(result.estimatedFoodSavedKg).toBeGreaterThan(1)
    expect(result.explanation).toContain('Ridge regression')
  })
})
