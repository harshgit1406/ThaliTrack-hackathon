import { describe, expect, it } from 'vitest'
import { validateModuleToggle } from './entitlements'
import type { FeatureModule } from '../types'

const modules: FeatureModule[] = [
  { code: 'kot', name: 'Kitchen order tickets', shortName: 'KOT', description: '', category: 'Operations', enabledFor: ['canteen-a'], status: 'ready' },
  { code: 'kds', name: 'Kitchen display', shortName: 'KDS', description: '', category: 'Operations', dependency: 'kot', enabledFor: ['canteen-a'], status: 'ready' },
  { code: 'reports', name: 'Reports', shortName: 'Reports', description: '', category: 'Commerce', enabledFor: [], status: 'ready' },
  { code: 'online_payments', name: 'Online payments', shortName: 'Payments', description: '', category: 'Commerce', enabledFor: [], status: 'planned' },
]

describe('module dependency checks', () => {
  it('requires KOT before KDS can be enabled', () => {
    expect(validateModuleToggle(modules, 'new-canteen', 'kds')).toEqual({
      allowed: false,
      message: 'Enable Kitchen order tickets first.',
    })
  })

  it('prevents KOT from being disabled while KDS is enabled', () => {
    expect(validateModuleToggle(modules, 'canteen-a', 'kot')).toEqual({
      allowed: false,
      message: 'Disable Kitchen display before turning off Kitchen order tickets.',
    })
  })

  it('allows an independent ready module to be toggled', () => {
    expect(validateModuleToggle(modules, 'canteen-b', 'reports').allowed).toBe(true)
  })

  it('blocks modules that are still awaiting approval', () => {
    expect(validateModuleToggle(modules, 'canteen-a', 'online_payments').allowed).toBe(false)
  })
})
