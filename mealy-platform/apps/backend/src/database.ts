import pg from 'pg'
import type { BackendConfig } from './config.js'

const { Pool } = pg

export type Queryable = { query: pg.Pool['query'] }

export function createPool(config: BackendConfig): pg.Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    application_name: 'mealy-backend',
    statement_timeout: 15_000,
    query_timeout: 20_000,
  })
}

export async function transaction<T>(pool: pg.Pool, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
