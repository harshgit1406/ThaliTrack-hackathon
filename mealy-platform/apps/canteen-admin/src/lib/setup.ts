import type { ManagementSetup } from '../types'

export function hoursSummary(setup: ManagementSetup, outletId: string): string {
  const open = setup.businessHours.filter((day) => day.outletId === outletId && day.isOpen)
  if (!open.length) return 'Closed all week'
  const groups = new Map<string, number>()
  for (const day of open) {
    const key = `${day.opensAt}–${day.closesAt}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const mostCommon = [...groups.entries()].sort((a, b) => b[1] - a[1])[0]
  return mostCommon ? `${mostCommon[0]} · ${open.length} days` : 'Schedule configured'
}
