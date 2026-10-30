import type { FeatureModule } from '../types'

export function validateModuleToggle(modules: FeatureModule[], canteenId: string, featureCode: string) {
  const feature = modules.find((item) => item.code === featureCode)
  if (!feature) return { allowed: false, message: 'Module not found.' }
  if (feature.status === 'planned') return { allowed: false, message: `${feature.name} is awaiting product approval.` }

  const isEnabled = feature.enabledFor.includes(canteenId)
  if (!isEnabled && feature.dependency) {
    const dependency = modules.find((item) => item.code === feature.dependency)
    if (!dependency?.enabledFor.includes(canteenId)) {
      return { allowed: false, message: `Enable ${dependency?.name ?? feature.dependency} first.` }
    }
  }

  if (isEnabled) {
    const dependent = modules.find((item) => item.dependency === featureCode && item.enabledFor.includes(canteenId))
    if (dependent) return { allowed: false, message: `Disable ${dependent.name} before turning off ${feature.name}.` }
  }

  return { allowed: true, message: '' }
}
