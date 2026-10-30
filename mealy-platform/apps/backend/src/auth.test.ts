import { describe, expect, it } from 'vitest'
import { bootstrapAuthorized, hashPassword, hashToken, newOpaqueToken, requirePermission, verifyPassword } from './auth.js'
import type { FastifyRequest } from 'fastify'
import { readConfig } from './config.js'

describe('staff credential helpers', () => {
  it('hashes PINs with a unique salt and verifies only the correct value', () => {
    const first = hashPassword('2468')
    const second = hashPassword('2468')
    expect(first).not.toBe(second)
    expect(verifyPassword('2468', first)).toBe(true)
    expect(verifyPassword('1357', first)).toBe(false)
    expect(verifyPassword('2468', 'invalid')).toBe(false)
  })

  it('creates opaque session tokens and stable storage hashes', () => {
    const token = newOpaqueToken()
    expect(token.length).toBeGreaterThan(30)
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashToken(token)).toBe(hashToken(token))
  })
})

describe('authorization scope boundaries', () => {
  const request = {
    principal: {
      userId: 'user-1', displayName: 'Outlet manager',
      memberships: [{ scopeType: 'outlet', canteenId: 'canteen-1', outletId: 'outlet-1', permissions: ['outlet.manage'] }],
    },
  } as FastifyRequest

  it('allows an outlet membership only for its exact outlet', () => {
    expect(requirePermission(request, 'outlet.manage', { canteenId: 'canteen-1', outletId: 'outlet-1' }).userId).toBe('user-1')
    expect(() => requirePermission(request, 'outlet.manage', { canteenId: 'canteen-1', outletId: 'outlet-2' })).toThrow('not allowed')
  })

  it('does not promote an outlet membership to canteen-wide access', () => {
    expect(() => requirePermission(request, 'outlet.manage', { canteenId: 'canteen-1' })).toThrow('not allowed')
  })

  it('lets a canteen membership reach its own outlets but no other canteen', () => {
    const canteenRequest = {
      principal: {
        userId: 'user-2', displayName: 'Canteen manager',
        memberships: [{ scopeType: 'canteen', canteenId: 'canteen-1', permissions: ['outlet.manage'] }],
      },
    } as FastifyRequest
    expect(requirePermission(canteenRequest, 'outlet.manage', { canteenId: 'canteen-1', outletId: 'outlet-1' }).userId).toBe('user-2')
    expect(() => requirePermission(canteenRequest, 'outlet.manage', { canteenId: 'canteen-2', outletId: 'outlet-2' })).toThrow('not allowed')
  })
})

describe('administrator bootstrap', () => {
  it('is disabled by default in production even when the token matches', () => {
    const config = readConfig({
      NODE_ENV: 'production', MEALY_DATABASE_URL: 'postgresql://unused',
      MEALY_BOOTSTRAP_ADMIN_TOKEN: 'x'.repeat(32),
    })
    expect(() => bootstrapAuthorized({ headers: { 'x-mealy-bootstrap-token': 'x'.repeat(32) } } as FastifyRequest, config)).toThrow('disabled')
  })
})
