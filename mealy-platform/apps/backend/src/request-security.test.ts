import { describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { requiredIdempotencyKey } from './request-security.js'

describe('idempotency key validation', () => {
  it('accepts UUID-style keys and rejects missing or unsafe values', () => {
    expect(requiredIdempotencyKey({ headers: { 'idempotency-key': 'order_123:retry-1' } } as FastifyRequest)).toBe('order_123:retry-1')
    expect(() => requiredIdempotencyKey({ headers: {} } as FastifyRequest)).toThrow('required')
    expect(() => requiredIdempotencyKey({ headers: { 'idempotency-key': 'bad key' } } as FastifyRequest)).toThrow('160 or fewer')
    expect(() => requiredIdempotencyKey({ headers: { 'idempotency-key': 'x'.repeat(161) } } as FastifyRequest)).toThrow('160 or fewer')
  })
})
