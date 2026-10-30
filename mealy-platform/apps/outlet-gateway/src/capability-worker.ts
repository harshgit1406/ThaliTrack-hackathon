import type { GatewayConfig } from './config.js'
import type { GatewayRepository } from './repository.js'

export class CapabilityWorker {
  private timer?: NodeJS.Timeout
  constructor(private readonly config: GatewayConfig, private readonly repository: GatewayRepository) {}

  start(): void {
    if (!this.config.cloudUrl || !this.config.cloudToken || this.timer) return
    this.timer = setInterval(() => void this.refresh(), 60_000)
    this.timer.unref()
    void this.refresh()
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }

  async refresh(): Promise<void> {
    if (!this.config.cloudUrl || !this.config.cloudToken) return
    try {
      const response = await fetch(`${this.config.cloudUrl.replace(/\/$/, '')}/v1/gateway/context`, {
        headers: { authorization: `Bearer ${this.config.cloudToken}` },
        signal: AbortSignal.timeout(this.config.cloudRequestTimeoutMs),
      })
      if (!response.ok) return
      const body = await response.json() as { data: { capabilities: string[] } }
      this.repository.saveCapabilities(body.data.capabilities)
    } catch { /* Keep the last durable entitlement snapshot while offline. */ }
  }
}
