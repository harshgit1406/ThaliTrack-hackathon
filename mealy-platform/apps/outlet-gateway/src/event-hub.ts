import type { ServerResponse } from 'node:http'
import type { GatewayEvent } from './types.js'

export class EventHub {
  private readonly clients = new Set<ServerResponse>()

  addClient(response: ServerResponse): () => void {
    this.clients.add(response)
    return () => this.clients.delete(response)
  }

  publish(event: GatewayEvent): void {
    const frame = `id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`
    for (const client of this.clients) client.write(frame)
  }

  heartbeat(): void {
    for (const client of this.clients) client.write(': heartbeat\n\n')
  }

  get clientCount(): number {
    return this.clients.size
  }
}
