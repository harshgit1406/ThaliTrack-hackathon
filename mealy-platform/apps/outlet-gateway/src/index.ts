import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { readGatewayConfig } from './config.js'
import { CloudSocket } from './cloud-socket.js'
import { EventHub } from './event-hub.js'
import { GatewayRepository } from './repository.js'
import { buildGatewayServer } from './server.js'
import { SyncWorker } from './sync-worker.js'
import { PrintWorker } from './print-worker.js'
import { TokenBlockWorker } from './token-block-worker.js'
import { CapabilityWorker } from './capability-worker.js'

if (existsSync('.env')) loadEnvFile('.env')

const config = readGatewayConfig()
process.umask(0o077)
const eventHub = new EventHub()
const repository = new GatewayRepository(config.databasePath, (event) => eventHub.publish(event))
const syncWorker = new SyncWorker(config, repository)

syncWorker.start()

const heartbeat = setInterval(() => eventHub.heartbeat(), 15_000)
heartbeat.unref()

const app = await buildGatewayServer({ config, repository, eventHub, syncWorker })
const cloudSocket = new CloudSocket(config, repository, (message, details) => app.log.info({ details }, message))
cloudSocket.start()
const printWorker = new PrintWorker(config, (message, details) => app.log.warn({ details }, message))
printWorker.start()
const tokenBlockWorker = new TokenBlockWorker(config, repository)
tokenBlockWorker.start()
const capabilityWorker = new CapabilityWorker(config, repository)
capabilityWorker.start()

if (!config.lanToken) {
  app.log.warn('MEALY_GATEWAY_LAN_TOKEN is not configured; LAN API requests are unauthenticated in this development run.')
}
if (!config.cloudUrl) {
  app.log.warn('MEALY_CLOUD_URL is not configured; events will remain safely queued in the local sync outbox.')
}

const shutdown = async () => {
  clearInterval(heartbeat)
  syncWorker.stop()
  cloudSocket.stop()
  printWorker.stop()
  tokenBlockWorker.stop()
  capabilityWorker.stop()
  await app.close()
  repository.close()
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)))
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)))

await app.listen({ host: config.host, port: config.port })
app.log.info({
  gateway_id: config.gatewayId,
  outlet_id: config.outletId,
  lan_url: `http://127.0.0.1:${config.port}`,
}, 'Mealy outlet gateway is ready')
