import type { GatewayConfig } from './config.js'
import type { GatewayRepository } from './repository.js'

export class SyncWorker {
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly config: GatewayConfig,
    private readonly repository: GatewayRepository,
  ) {}

  start(): void {
    if (!this.config.cloudUrl || this.timer) return
    this.timer = setInterval(() => void this.flush(), this.config.syncIntervalMs)
    this.timer.unref()
    void this.flush()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async flush(): Promise<void> {
    if (this.running || !this.config.cloudUrl) return
    const events = this.repository.getDueOutbox(100)
    if (events.length === 0) return
    this.running = true

    try {
      const response = await fetch(`${this.config.cloudUrl.replace(/\/$/, '')}/v1/outlet-sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.cloudToken ? { authorization: `Bearer ${this.config.cloudToken}` } : {}),
        },
        body: JSON.stringify({
          gateway_id: this.config.gatewayId,
          outlet_id: this.config.outletId,
          events,
        }),
        signal: AbortSignal.timeout(this.config.cloudRequestTimeoutMs),
      })

      if (!response.ok) throw new Error(`Cloud sync returned HTTP ${response.status}`)
      const body = await response.json() as { acknowledged_event_ids?: string[] }
      const acknowledged = body.acknowledged_event_ids ?? []
      if (acknowledged.length === 0) throw new Error('Cloud sync did not acknowledge any events')
      this.repository.acknowledgeOutbox(acknowledged)
    } catch (error) {
      const attempts = Math.max(...events.map((event) => event.attempts), 0)
      const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6))
      this.repository.failOutbox(
        events.map((event) => event.eventId),
        error instanceof Error ? error.message : 'Unknown cloud sync error',
        delayMs,
      )
    } finally {
      this.running = false
    }
  }
}
