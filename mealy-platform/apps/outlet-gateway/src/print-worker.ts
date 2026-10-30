import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { GatewayConfig } from './config.js'

type PrintJob = {
  id: string
  document_type: 'kot' | 'receipt' | 'bill' | 'token' | 'summary'
  printer_name: string
  connection_config: { queue?: string }
  public_number?: string
  token_label?: string
  customer_name_snapshot?: string
  customer_note?: string
  subtotal_minor?: string | number
  discount_total_minor?: string | number
  tax_total_minor?: string | number
  charge_total_minor?: string | number
  rounding_minor?: string | number
  total_minor?: string | number
  receipt_number?: string
  issued_at?: string
  items: Array<{ name: string; variant?: string | null; quantity: number; unit_price_minor: string | number; line_total_minor: string | number; notes?: string | null }>
}

function money(value: string | number | undefined): string {
  return `INR ${(Number(value ?? 0) / 100).toFixed(2)}`
}

function render(job: PrintJob): string {
  const title = job.document_type === 'kot' ? 'KITCHEN ORDER TICKET' : 'RECEIPT'
  const lines = [title, '='.repeat(32)]
  if (job.receipt_number) lines.push(`Receipt: ${job.receipt_number}`)
  if (job.public_number) lines.push(`Order: ${job.public_number}`)
  if (job.token_label) lines.push(`Token: ${job.token_label}`)
  if (job.customer_name_snapshot) lines.push(`Customer: ${job.customer_name_snapshot}`)
  if (job.issued_at) lines.push(`Issued: ${new Date(job.issued_at).toLocaleString('en-IN')}`)
  lines.push('-'.repeat(32))
  for (const item of job.items ?? []) {
    lines.push(`${item.quantity} x ${item.name}${item.variant ? ` - ${item.variant}` : ''}`)
    if (job.document_type !== 'kot') lines.push(`  ${money(item.line_total_minor)}`)
    if (item.notes) lines.push(`  NOTE: ${item.notes}`)
  }
  if (job.customer_note) lines.push('-'.repeat(32), `ORDER NOTE: ${job.customer_note}`)
  if (job.document_type !== 'kot') {
    lines.push('-'.repeat(32), `Subtotal: ${money(job.subtotal_minor)}`)
    if (Number(job.discount_total_minor)) lines.push(`Discount: -${money(job.discount_total_minor)}`)
    if (Number(job.tax_total_minor)) lines.push(`Tax: ${money(job.tax_total_minor)}`)
    if (Number(job.charge_total_minor)) lines.push(`Charges: ${money(job.charge_total_minor)}`)
    lines.push(`TOTAL: ${money(job.total_minor)}`)
  }
  lines.push('='.repeat(32), '')
  return lines.join('\r\n')
}

async function windowsPrint(file: string, queue: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-Content -Raw -LiteralPath $env:MEALY_PRINT_FILE | Out-Printer -Name $env:MEALY_PRINT_QUEUE',
    ], { windowsHide: true, env: { ...process.env, MEALY_PRINT_FILE: file, MEALY_PRINT_QUEUE: queue } })
    let errorText = ''
    child.stderr.on('data', (chunk) => { errorText += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(errorText.trim() || `Printer command exited with ${code}`)))
  })
}

export class PrintWorker {
  private timer?: NodeJS.Timeout
  private running = false

  constructor(private readonly config: GatewayConfig, private readonly log: (message: string, details?: unknown) => void) {}

  start(): void {
    if (!this.config.cloudUrl || !this.config.cloudToken || this.timer) return
    this.timer = setInterval(() => void this.flush(), this.config.printPollMs)
    this.timer.unref()
    void this.flush()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async flush(): Promise<void> {
    if (this.running || !this.config.cloudUrl || !this.config.cloudToken) return
    this.running = true
    try {
      const response = await fetch(`${this.config.cloudUrl.replace(/\/$/, '')}/v1/gateway/print-jobs`, {
        headers: { authorization: `Bearer ${this.config.cloudToken}` },
        signal: AbortSignal.timeout(this.config.cloudRequestTimeoutMs),
      })
      if (!response.ok) throw new Error(`Print queue returned HTTP ${response.status}`)
      const body = await response.json() as { data: { jobs: PrintJob[] } }
      await mkdir(this.config.printSpoolDir, { recursive: true })
      for (const job of body.data.jobs) {
        let printed = false
        let failure: string | undefined
        try {
          const file = path.join(this.config.printSpoolDir, `${job.document_type}-${job.id}.txt`)
          await writeFile(file, render(job), 'utf8')
          if (this.config.printMode === 'windows') {
            const queue = job.connection_config?.queue
            if (!queue) throw new Error(`${job.printer_name} has no Windows print queue configured`)
            await windowsPrint(file, queue)
          }
          printed = true
        } catch (error) {
          failure = error instanceof Error ? error.message : 'Unknown printer failure'
        }
        await fetch(`${this.config.cloudUrl.replace(/\/$/, '')}/v1/gateway/print-jobs/${job.id}/result`, {
          method: 'POST', headers: { authorization: `Bearer ${this.config.cloudToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ printed, ...(failure ? { error: failure } : {}) }),
          signal: AbortSignal.timeout(this.config.cloudRequestTimeoutMs),
        })
      }
    } catch (error) {
      this.log('Print worker could not flush', error)
    } finally {
      this.running = false
    }
  }
}
