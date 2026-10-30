import { buildApi } from './app.js'
import { readConfig } from './config.js'
import { createPool } from './database.js'

const config = readConfig()
const pool = createPool(config)
const app = await buildApi(config, pool)

const shutdown = async () => {
  await app.close()
  await pool.end()
}
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

await app.listen({ host: config.apiHost, port: config.apiPort })
