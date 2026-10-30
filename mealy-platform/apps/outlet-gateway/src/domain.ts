import { z } from 'zod'

export class GatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
  }
}

export const createOrderSchema = z.object({
  orderId: z.string().min(1).optional(),
  ticketId: z.string().min(1).optional(),
  orderNumber: z.string().trim().min(1).max(80).optional(),
  kotNumber: z.string().trim().min(1).max(80).optional(),
  token: z.string().trim().min(1).max(40).optional(),
  source: z.enum(['Counter POS', 'Student app', 'QR order']),
  promisedMinutes: z.number().int().min(1).max(240).optional(),
  priority: z.boolean().optional(),
  customerNote: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    id: z.string().min(1).optional(),
    catalogItemId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
    unitPriceMinor: z.number().int().nonnegative().optional(),
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(999),
    modifiers: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    note: z.string().trim().max(500).optional(),
  })).min(1).max(200),
  commercial: z.object({
    counterId: z.string().uuid(),
    terminalId: z.string().uuid(),
    shiftId: z.string().uuid(),
    staffUserId: z.string().uuid(),
    paymentMethodConfigId: z.string().uuid(),
    currencyCode: z.string().length(3),
    subtotalMinor: z.number().int().nonnegative(),
    totalMinor: z.number().int().nonnegative(),
  }).optional(),
})

export const itemReadinessSchema = z.object({ ready: z.boolean() })
export const delayTicketSchema = z.object({
  minutes: z.number().int().min(1).max(60),
  reason: z.string().trim().min(3).max(300),
})
export const remakeTicketSchema = z.object({ reason: z.string().trim().min(3).max(300) })
