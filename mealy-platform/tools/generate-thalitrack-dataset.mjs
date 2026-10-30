import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dishes = [
  ['30000000-0000-4000-8000-000000000001', 'Masala Poha', 0.25],
  ['30000000-0000-4000-8000-000000000002', 'Campus Veg Thali', 0.45],
  ['30000000-0000-4000-8000-000000000003', 'Grilled Paneer Sandwich', 0.28],
  ['30000000-0000-4000-8000-000000000004', 'Masala Chai', 0.18],
  ['30000000-0000-4000-8000-000000000008', 'Rajma Chawal', 0.40],
  ['30000000-0000-4000-8000-000000000009', 'Punjabi Samosa', 0.15],
  ['30000000-0000-4000-8000-000000000010', 'Chole Kulche', 0.38],
  ['30000000-0000-4000-8000-000000000011', 'Veg Hakka Noodles', 0.32],
  ['30000000-0000-4000-8000-000000000012', 'Aloo Paratha', 0.30],
  ['30000000-0000-4000-8000-000000000013', 'Sweet Lassi', 0.25],
]
const rows = ['service_date,catalog_item_id,dish_name,order_count,quantity_ordered,quantity_sold,leftover_kg,portion_weight_kg,lecture_rush_index']
const start = new Date('2026-10-02T00:00:00Z')
for (let day = 0; day < 28; day += 1) {
  const date = new Date(start)
  date.setUTCDate(start.getUTCDate() + day)
  const serviceDate = date.toISOString().slice(0, 10)
  const weekday = date.getUTCDay()
  const weekdayRush = weekday >= 1 && weekday <= 5
  dishes.forEach(([id, name, portion], index) => {
    const demand = 18 + (index + 1) * 3 + (weekdayRush ? 14 : 2) + Math.floor(day / 7) * 2
    const leftover = Math.max(0.35, 3.8 - day * 0.08 + (index + 1) * 0.06)
    const sold = Math.max(0, demand - Math.max(1, Math.round(leftover / Number(portion))))
    rows.push([serviceDate, id, `"${name}"`, Math.max(1, Math.round(demand * 0.72)), demand, sold, leftover.toFixed(3), portion, weekdayRush ? '1.45' : '0.85'].join(','))
  })
}
const target = resolve('data/thalitrack-four-weeks.csv')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${rows.join('\n')}\n`, 'utf8')
console.log(`Wrote ${rows.length - 1} rows to ${target}`)
