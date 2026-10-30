export type DemandPoint = { serviceDate: string; quantityOrdered: number; leftoverKg: number; portionWeightKg: number; rushIndex: number }

export type DishForecast = {
  recommendedQuantity: number; rawPrediction: number; confidence: number; meanAbsoluteError: number
  baselineLeftoverKg: number; recentLeftoverKg: number; estimatedFoodSavedKg: number; explanation: string
}

function solve(matrix: number[][], vector: number[]): number[] {
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0])
  for (let column = 0; column < matrix.length; column += 1) {
    let pivot = column
    for (let row = column + 1; row < matrix.length; row += 1) if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row
    ;[augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!]
    const divisor = augmented[column]![column] || 1e-9
    for (let cell = column; cell <= matrix.length; cell += 1) augmented[column]![cell] = (augmented[column]![cell] ?? 0) / divisor
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === column) continue
      const factor = augmented[row]![column] ?? 0
      for (let cell = column; cell <= matrix.length; cell += 1) augmented[row]![cell] = (augmented[row]![cell] ?? 0) - factor * (augmented[column]![cell] ?? 0)
    }
  }
  return augmented.map((row) => row[matrix.length] ?? 0)
}

function features(date: Date, trend: number, rushIndex: number): number[] {
  const angle = (2 * Math.PI * date.getUTCDay()) / 7
  return [1, trend, Math.sin(angle), Math.cos(angle), rushIndex]
}

const dot = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

export function forecastDish(points: DemandPoint[], targetDate: string, targetRushIndex = 1): DishForecast {
  if (points.length < 7) throw new Error('At least seven demand observations are required')
  const sorted = [...points].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
  const rows = sorted.map((point, index) => features(new Date(`${point.serviceDate}T00:00:00Z`), index / Math.max(1, sorted.length - 1), point.rushIndex))
  const targets = sorted.map((point) => Math.max(0, point.quantityOrdered - point.leftoverKg / point.portionWeightKg))
  const size = rows[0]!.length
  const xtx = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => rows.reduce((sum, row) => sum + row[i]! * row[j]!, 0) + (i === j ? 0.35 : 0)))
  const xty = Array.from({ length: size }, (_, i) => rows.reduce((sum, row, index) => sum + row[i]! * targets[index]!, 0))
  const weights = solve(xtx, xty)
  const prediction = Math.max(0, dot(weights, features(new Date(`${targetDate}T00:00:00Z`), (sorted.length + 1) / sorted.length, targetRushIndex)))
  const meanAbsoluteError = average(rows.map((row, index) => Math.abs(dot(weights, row) - targets[index]!)))
  const baselineLeftoverKg = average(sorted.slice(0, Math.max(1, sorted.length - 7)).map((point) => point.leftoverKg))
  const recentLeftoverKg = average(sorted.slice(-7).map((point) => point.leftoverKg))
  const estimatedFoodSavedKg = Math.max(0, baselineLeftoverKg - recentLeftoverKg)
  const confidence = Math.max(0.35, Math.min(0.96, 1 - meanAbsoluteError / Math.max(1, average(targets))))
  return {
    recommendedQuantity: Math.ceil(prediction), rawPrediction: Number(prediction.toFixed(2)), confidence: Number(confidence.toFixed(2)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(2)), baselineLeftoverKg: Number(baselineLeftoverKg.toFixed(3)),
    recentLeftoverKg: Number(recentLeftoverKg.toFixed(3)), estimatedFoodSavedKg: Number(estimatedFoodSavedKg.toFixed(3)),
    explanation: `Ridge regression trained on ${sorted.length} daily observations, weekday seasonality, trend, lecture rush, and leftover portions.`,
  }
}
