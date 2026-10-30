import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) loadEnvFile('.env')

function text(value: string | undefined, fallback?: string): string {
  const normalized = value?.trim() || fallback
  if (!normalized) throw new Error('A required environment variable is missing')
  return normalized
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function otpProvider(value: string | undefined, isProduction: boolean): 'console' | 'unconfigured' {
  const provider = value?.trim() || (isProduction ? 'unconfigured' : 'console')
  if (provider !== 'console' && provider !== 'unconfigured') throw new Error('MEALY_OTP_PROVIDER must be console or unconfigured')
  if (isProduction && provider === 'console') throw new Error('Console OTP delivery is not allowed in production')
  return provider
}

export type BackendConfig = ReturnType<typeof readConfig>

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const isProduction = env.NODE_ENV === 'production'
  const bootstrapToken = text(env.MEALY_BOOTSTRAP_ADMIN_TOKEN, 'development-bootstrap-token-change-me')
  if (isProduction && bootstrapToken.length < 32) {
    throw new Error('MEALY_BOOTSTRAP_ADMIN_TOKEN must be at least 32 characters in production')
  }

  return {
    isProduction,
    databaseUrl: text(env.MEALY_DATABASE_URL),
    databasePoolMax: integer(env.MEALY_DATABASE_POOL_MAX, 10),
    trustProxy: boolean(env.MEALY_TRUST_PROXY, false),
    bodyLimitBytes: integer(env.MEALY_BODY_LIMIT_BYTES, 1_048_576),
    rateLimitMax: integer(env.MEALY_RATE_LIMIT_MAX, 300),
    authRateLimitMax: integer(env.MEALY_AUTH_RATE_LIMIT_MAX, 10),
    realtimeMaxConnections: integer(env.MEALY_REALTIME_MAX_CONNECTIONS, 500),
    realtimeMaxPayloadBytes: integer(env.MEALY_REALTIME_MAX_PAYLOAD_BYTES, 65_536),
    apiHost: text(env.MEALY_API_HOST, '0.0.0.0'),
    apiPort: integer(env.PORT ?? env.MEALY_API_PORT, 8080),
    realtimeHost: text(env.MEALY_REALTIME_HOST, '0.0.0.0'),
    realtimePort: integer(env.PORT ?? env.MEALY_REALTIME_PORT, 8081),
    allowedOrigins: text(env.MEALY_ALLOWED_ORIGINS, 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
    bootstrapToken,
    bootstrapEnabled: boolean(env.MEALY_BOOTSTRAP_ADMIN_ENABLED, !isProduction),
    demoMode: boolean(env.MEALY_DEMO_MODE, false),
    sessionTtlHours: integer(env.MEALY_SESSION_TTL_HOURS, 24),
    otpProvider: otpProvider(env.MEALY_OTP_PROVIDER, isProduction),
    workerIntervalMs: integer(env.MEALY_WORKER_INTERVAL_MS, 1_000),
    realtimePollMs: integer(env.MEALY_REALTIME_POLL_MS, 500),
    gatewayHeartbeatMs: integer(env.MEALY_GATEWAY_HEARTBEAT_MS, 15_000),
    gatewayStaleMs: integer(env.MEALY_GATEWAY_STALE_MS, 45_000),
  }
}
