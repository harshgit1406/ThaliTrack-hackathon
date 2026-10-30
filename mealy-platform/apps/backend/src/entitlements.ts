import type pg from 'pg'
import { AppError } from './errors.js'

export async function requireOutletFeature(pool: pg.Pool | pg.PoolClient, outletId: string, featureCode: string): Promise<void> {
  const result = await pool.query<{ enabled: boolean }>(`
    SELECT COALESCE(feature.enabled, definition.default_enabled) AS enabled
    FROM mealy.outlets outlet
    JOIN mealy.campus_canteens assignment ON assignment.id = outlet.campus_canteen_id
    JOIN mealy.feature_definitions definition ON definition.code = $2
    LEFT JOIN mealy.canteen_features feature ON feature.canteen_id = assignment.canteen_id
      AND feature.feature_code = definition.code
      AND feature.effective_from <= now()
      AND (feature.effective_until IS NULL OR feature.effective_until > now())
    WHERE outlet.id = $1
  `, [outletId, featureCode])
  if (!result.rows[0]?.enabled) {
    throw new AppError('FEATURE_DISABLED', `The ${featureCode} module is not enabled for this canteen.`, 403, { feature_code: featureCode })
  }
}
