import WebSocket from 'ws'
import type { GatewayConfig } from './config.js'
import type { GatewayRepository } from './repository.js'
import type { CloudOrder } from './types.js'

type CloudEvent = { sequence: number; event_type: string; payload: { order?: CloudOrder } }
type CloudMessage =
  | { type: 'hello'; cursor: number }
  | { type: 'ping' }
  | { type: 'events'; through_sequence: number; events: CloudEvent[] }

export class CloudSocket {
  private socket?: WebSocket
  private retryTimer?: NodeJS.Timeout
  private stopped = false
  private retryAttempt = 0

  constructor(
    private readonly config: GatewayConfig,
    private readonly repository: GatewayRepository,
    private readonly log: (message: string, details?: unknown) => void = () => undefined,
  ) {}

  start(): void {
    if (!this.config.cloudRealtimeUrl || !this.config.cloudToken || this.socket || this.stopped) return
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.socket?.close(1000, 'Gateway shutting down')
    this.socket = undefined
  }

  private connect(): void {
    if (this.stopped || !this.config.cloudRealtimeUrl || !this.config.cloudToken) return
    const base = this.config.cloudRealtimeUrl.replace(/\/$/, '')
    this.socket = new WebSocket(`${base}/v1/realtime/gateway`, {
      headers: { authorization: `Bearer ${this.config.cloudToken}` },
      maxPayload: this.config.bodyLimitBytes,
      perMessageDeflate: false,
    })
    this.socket.on('open', () => {
      this.retryAttempt = 0
      this.log('Cloud WebSocket connected')
      this.send({ type: 'resume', sequence: this.repository.getCloudCursor() })
    })
    this.socket.on('message', (raw) => void this.handleMessage(raw.toString()))
    this.socket.on('error', (error) => this.log('Cloud WebSocket error', error))
    this.socket.on('close', () => {
      this.socket = undefined
      if (!this.stopped) this.scheduleReconnect()
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as CloudMessage
      if (message.type === 'ping') {
        this.send({ type: 'pong' })
        return
      }
      if (message.type !== 'events') return
      let acknowledged = this.repository.getCloudCursor()
      for (const event of message.events) {
        if (event.sequence <= acknowledged) continue
        if (event.payload.order) this.repository.ingestCloudOrder(event.payload.order, event.sequence)
        acknowledged = event.sequence
      }
      if (acknowledged === message.through_sequence) this.send({ type: 'ack', sequence: acknowledged })
    } catch (error) {
      this.log('Cloud event batch was not acknowledged', error)
      this.socket?.close(4002, 'Unable to persist cloud event')
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  private scheduleReconnect(): void {
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(this.retryAttempt++, 6))
    this.retryTimer = setTimeout(() => this.connect(), delay)
    this.retryTimer.unref()
  }
}
