import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly fields?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, fields: error.fields, request_id: request.id },
      })
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'The request payload is invalid.', fields: error.flatten().fieldErrors, request_id: request.id },
      })
    }
    if (statusCode === 413) {
      return reply.status(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request payload is too large.', request_id: request.id } })
    }
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', request_id: request.id } })
    }
    if (statusCode === 400) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'The request could not be parsed.', request_id: request.id } })
    }
    request.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'The server could not complete this request.', request_id: request.id },
    })
  })
}
