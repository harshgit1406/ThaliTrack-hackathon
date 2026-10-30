import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) loadEnvFile('.env')

export type GatewayConfig = {
  gatewayId: string
  outletId: string
  outletName: string
  stationId: string
  stationName: string
  counterId?: string
  terminalId?: string
  host: string
  port: number
  dataDir: string
  databasePath: string
  lanToken?: string
  allowedOrigins: string[]
  kdsDistDir: string
  cloudUrl?: string
  cloudRealtimeUrl?: string
  cloudToken?: string
  syncIntervalMs: number
  printMode: 'file' | 'windows'
  printSpoolDir: string
  printPollMs: number
  isProduction: boolean
  bodyLimitBytes: number
  rateLimitMax: number
  maxSseClients: number
  cloudRequestTimeoutMs: number
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): GatewayConfig {
  const dataDir = path.resolve(cwd, optional(env.MEALY_GATEWAY_DATA_DIR) ?? '.data')
  const isProduction = env.NODE_ENV === 'production'
  const lanToken = optional(env.MEALY_GATEWAY_LAN_TOKEN)

  if (isProduction && (!lanToken || lanToken.length < 24)) {
    throw new Error('MEALY_GATEWAY_LAN_TOKEN must be at least 24 characters in production')
  }
  const cloudUrl = optional(env.MEALY_CLOUD_URL)
  const cloudRealtimeUrl = optional(env.MEALY_CLOUD_REALTIME_URL)
  const cloudToken = optional(env.MEALY_CLOUD_GATEWAY_TOKEN)
  if (isProduction && cloudUrl && !cloudUrl.startsWith('https://')) throw new Error('MEALY_CLOUD_URL must use HTTPS in production')
  if (isProduction && cloudRealtimeUrl && !cloudRealtimeUrl.startsWith('wss://')) throw new Error('MEALY_CLOUD_REALTIME_URL must use WSS in production')
  if (isProduction && (cloudUrl || cloudRealtimeUrl) && (!cloudToken || cloudToken.length < 32)) {
    throw new Error('MEALY_CLOUD_GATEWAY_TOKEN must be at least 32 characters when cloud sync is enabled in production')
  }

  return {
    gatewayId: optional(env.MEALY_GATEWAY_ID) ?? 'gateway-development',
    outletId: optional(env.MEALY_OUTLET_ID) ?? 'outlet-development',
    outletName: optional(env.MEALY_OUTLET_NAME) ?? 'Development Outlet',
    stationId: optional(env.MEALY_STATION_ID) ?? 'station-main-kitchen',
    stationName: optional(env.MEALY_STATION_NAME) ?? 'Main Kitchen',
    counterId: optional(env.MEALY_COUNTER_ID),
    terminalId: optional(env.MEALY_TERMINAL_ID),
    host: optional(env.MEALY_GATEWAY_HOST) ?? '0.0.0.0',
    port: positiveInteger(env.MEALY_GATEWAY_PORT, 8788),
    dataDir,
    databasePath: path.join(dataDir, 'gateway.sqlite'),
    lanToken,
    allowedOrigins: (optional(env.MEALY_GATEWAY_ALLOWED_ORIGINS) ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8788,http://localhost:8788')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    kdsDistDir: path.resolve(cwd, optional(env.MEALY_KDS_DIST_DIR) ?? '../kds/dist'),
    cloudUrl,
    cloudRealtimeUrl,
    cloudToken,
    syncIntervalMs: positiveInteger(env.MEALY_SYNC_INTERVAL_MS, 5_000),
    printMode: optional(env.MEALY_PRINTER_MODE) === 'windows' ? 'windows' : 'file',
    printSpoolDir: path.join(dataDir, 'print-spool'),
    printPollMs: positiveInteger(env.MEALY_PRINT_POLL_MS, 3_000),
    isProduction,
    bodyLimitBytes: positiveInteger(env.MEALY_GATEWAY_BODY_LIMIT_BYTES, 262_144),
    rateLimitMax: positiveInteger(env.MEALY_GATEWAY_RATE_LIMIT_MAX, 300),
    maxSseClients: positiveInteger(env.MEALY_GATEWAY_MAX_SSE_CLIENTS, 25),
    cloudRequestTimeoutMs: positiveInteger(env.MEALY_CLOUD_REQUEST_TIMEOUT_MS, 10_000),
  }
}
