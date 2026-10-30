import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfig } from './config.js'
import { createPool } from './database.js'

if (process.env.MEALY_ALLOW_SAMPLE_DATA !== 'true') {
  throw new Error('Refusing to load sample data. Set MEALY_ALLOW_SAMPLE_DATA=true for an intentional local development run.')
}

const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database')
const seedSql = await readFile(path.join(databaseRoot, 'seeds/development_sample.sql'), 'utf8')
const verificationSql = await readFile(path.join(databaseRoot, 'tests/sample_data_test.sql'), 'utf8')
const pool = createPool(readConfig())

try {
  await pool.query(seedSql)
  await pool.query(verificationSql)
  console.log('Mealy development sample data loaded and verified.')
} finally {
  await pool.end()
}
