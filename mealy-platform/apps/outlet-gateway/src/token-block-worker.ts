import type { GatewayConfig } from './config.js'
import type { GatewayRepository } from './repository.js'

export class TokenBlockWorker {
  private timer?: NodeJS.Timeout
  private running = false

  constructor(private readonly config: GatewayConfig, private readonly repository: GatewayRepository) {}

  start(): void {
    if (!this.config.cloudUrl || !this.config.cloudToken || !this.config.counterId || this.timer) return
    this.timer = setInterval(() => void this.ensureCapacity(), 30_000)
    this.timer.unref()
    void this.ensureCapacity()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async ensureCapacity(): Promise<void> {
    if (this.running || !this.config.cloudUrl || !this.config.cloudToken || !this.config.counterId) return
    if (this.repository.remainingReservedTokens(this.config.counterId) >= 10) return
    this.running = true
    try {
      const response = await fetch(`${this.config.cloudUrl.replace(/\/$/, '')}/v1/gateway/token-blocks/reserve`, {
        method: 'POST', headers: { authorization: `Bearer ${this.config.cloudToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ counter_id: this.config.counterId, size: 25 }),
        signal: AbortSignal.timeout(this.config.cloudRequestTimeoutMs),
      })
      if (!response.ok) return
      const body = await response.json() as { data: { block: Parameters<GatewayRepository['saveTokenBlock']>[0] } }
      this.repository.saveTokenBlock(body.data.block)
    } catch {
      // Offline operation continues with the currently reserved token block.
    } finally {
      this.running = false
    }
  }
}
