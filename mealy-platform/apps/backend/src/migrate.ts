import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfig } from './config.js'
import { createPool } from './database.js'

const config = readConfig()
const pool = createPool(config)
const migrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database/migrations')

await pool.query(`
  CREATE TABLE IF NOT EXISTS public.mealy_schema_migrations (
    filename text PRIMARY KEY,
    sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`)

const filenames = (await readdir(migrationRoot)).filter((name) => name.endsWith('.sql')).sort()
for (const filename of filenames) {
  const sql = await readFile(path.join(migrationRoot, filename), 'utf8')
  const checksum = createHash('sha256').update(sql).digest('hex')
  const applied = await pool.query<{ sha256: string }>('SELECT sha256 FROM public.mealy_schema_migrations WHERE filename = $1', [filename])
  if (applied.rows[0]) {
    if (applied.rows[0].sha256 !== checksum) throw new Error(`Applied migration ${filename} was modified`)
    continue
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '10s'")
    await client.query("SET LOCAL statement_timeout = '5min'")
    await client.query(sql)
    await client.query('INSERT INTO public.mealy_schema_migrations (filename, sha256) VALUES ($1, $2)', [filename, checksum])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

await pool.end()
