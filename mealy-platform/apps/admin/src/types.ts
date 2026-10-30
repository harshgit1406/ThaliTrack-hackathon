export type AdminView = 'overview' | 'campuses' | 'canteens' | 'modules' | 'team' | 'roles' | 'operations' | 'audit' | 'settings'
export type Status = 'active' | 'onboarding' | 'suspended' | 'draft' | 'invited'

export interface Campus {
  id: string
  code: string
  name: string
  city: string
  address: string
  contact: string
  status: 'active' | 'draft' | 'suspended'
  canteens: number
  students: number
}

export interface Canteen {
  id: string
  code: string
  name: string
  campusId: string
  campus: string
  status: 'active' | 'onboarding' | 'suspended'
  outlets: number
  admins: number
  modules: number
  setupProgress: number
  ordersToday: number
  health: 'healthy' | 'attention' | 'offline'
  supportEmail: string
  supportPhone: string
}

export interface FeatureModule {
  code: string
  name: string
  shortName: string
  description: string
  category: 'Ordering' | 'Operations' | 'Commerce'
  dependency?: string
  enabledFor: string[]
  status: 'ready' | 'planned'
}

export interface TeamMember {
  id: string
  name: string
  email: string
  initials: string
  role: string
  scope: string
  status: 'active' | 'invited' | 'suspended'
  lastSeen: string
  mfa: boolean
}

export interface RoleDefinition {
  id: string
  name: string
  description: string
  members: number
  permissions: string[]
  system: boolean
}

export interface OperationAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  canteen: string
  age: string
  kind: 'KOT' | 'Order' | 'Device' | 'Sync'
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  target: string
  scope: string
  time: string
  risk: 'normal' | 'sensitive' | 'critical'
}
