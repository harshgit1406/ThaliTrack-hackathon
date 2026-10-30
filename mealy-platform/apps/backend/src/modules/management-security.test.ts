import Fastify from 'fastify'
import type pg from 'pg'
import { describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../errors.js'
import { registerManagementRoutes } from './management.js'

function principal(scopeType: 'canteen' | 'outlet', permissions: string[]) {
  return {
    userId: 'user-1', displayName: 'Manager',
    memberships: [{ scopeType, canteenId: 'c0000000-0000-4000-8000-000000000001', outletId: scopeType === 'outlet' ? 'e0000000-0000-4000-8000-000000000001' : undefined, permissions }],
  }
}

describe('management snapshot authorization', () => {
  it('returns reporting data but suppresses team and audit rows without their permissions', async () => {
    const queries: string[] = []
    const pool = {
      query: async (sql: string) => {
        queries.push(sql)
        if (sql.includes('FROM mealy.canteens canteen')) return { rows: [{ id: 'canteen' }] }
        if (sql.includes('FROM mealy.outlets outlet')) return { rows: [{ id: 'outlet' }] }
        if (sql.includes('FROM mealy.orders orders')) return { rows: [{ id: 'order' }] }
        if (sql.includes('FROM mealy.catalog_items item')) return { rows: [{ id: 'item' }] }
        return { rows: [{ id: 'unexpected' }] }
      },
    } as unknown as pg.Pool
    const app = Fastify()
    registerErrorHandler(app)
    app.addHook('preHandler', async (request) => { request.principal = principal('canteen', ['reports.read']) })
    await registerManagementRoutes(app, pool)

    const response = await app.inject({ method: 'GET', url: '/v1/management/snapshot' })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({
      canteens: [{ id: 'canteen' }], outlets: [{ id: 'outlet' }], orders: [{ id: 'order' }], items: [{ id: 'item' }], team: [], activities: [],
    })
    expect(queries).toHaveLength(4)
    await app.close()
  })

  it('does not treat outlet reporting permission as canteen dashboard access', async () => {
    const pool = { query: async () => ({ rows: [] }) } as unknown as pg.Pool
    const app = Fastify()
    registerErrorHandler(app)
    app.addHook('preHandler', async (request) => { request.principal = principal('outlet', ['reports.read']) })
    await registerManagementRoutes(app, pool)

    const response = await app.inject({ method: 'GET', url: '/v1/management/snapshot' })
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('PERMISSION_DENIED')
    await app.close()
  })
})
