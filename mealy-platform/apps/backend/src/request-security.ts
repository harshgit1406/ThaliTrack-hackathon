import type { FastifyRequest } from 'fastify'
import { AppError } from './errors.js'

export function requiredIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key']
  const key = typeof value === 'string' ? value.trim() : ''
  if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required.', 400)
  if (key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AppError('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must use 160 or fewer letters, numbers, dots, underscores, colons, or hyphens.', 400)
  }
  return key
}
