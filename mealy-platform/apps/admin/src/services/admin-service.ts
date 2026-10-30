/* API response rows are normalized at this boundary before reaching the UI. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuditEntry, Campus, Canteen, FeatureModule, OperationAlert, RoleDefinition, TeamMember } from '../types'

const apiBaseUrl = (import.meta.env.VITE_MEALY_API_BASE_URL ?? '').trim().replace(/\/$/, '')

function token(): string {
  return window.sessionStorage.getItem('mealy-access-token')?.trim() ?? ''
}

async function request<T>(path: string): Promise<T> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const accessToken = token()
  if (!accessToken) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  const body = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return body
}

async function write<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error('Configure VITE_MEALY_API_BASE_URL.')
  const accessToken = token()
  if (!accessToken) throw new Error('Sign in is required. No Mealy access token is configured.')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message ?? `Mealy API returned HTTP ${response.status}`)
  return payload
}

export async function createCampus(input: { code: string; name: string }): Promise<void> {
  await write('/v1/admin/campuses', 'POST', { ...input, timezone: 'Asia/Kolkata' })
}

export async function onboardCanteen(input: { campusId: string; code: string; name: string; outletName: string }): Promise<string> {
  const response = await write<{ data: { canteen: { id: string } } }>('/v1/admin/canteens/onboard', 'POST', {
    campus_id: input.campusId,
    canteen: { code: input.code, name: input.name },
    outlet: { code: `${input.code.slice(0, 24)}_MAIN`, name: input.outletName || 'Main outlet' },
    counter: { code: 'MAIN', name: 'Main counter', token_prefix: '' },
  })
  return response.data.canteen.id
}

export async function setCanteenFeature(canteenId: string, featureCode: string, enabled: boolean): Promise<void> {
  await write(`/v1/admin/canteens/${encodeURIComponent(canteenId)}/features/${encodeURIComponent(featureCode)}`, 'PUT', {
    enabled, configuration: {},
  })
}

export type AdminSnapshot = {
  campuses: Campus[]
  canteens: Canteen[]
  modules: FeatureModule[]
  team: TeamMember[]
  roles: RoleDefinition[]
  alerts: OperationAlert[]
  audit: AuditEntry[]
}

function elapsed(value: string | null): string {
  if (!value) return 'Never'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes} min ago`
  return new Date(value).toLocaleString()
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const [campusResponse, featureResponse, teamResponse, roleResponse, operationResponse, auditResponse] = await Promise.all([
    request<any>('/v1/admin/campuses'), request<any>('/v1/admin/features'), request<any>('/v1/admin/team'),
    request<any>('/v1/admin/roles'), request<any>('/v1/admin/operations'), request<any>('/v1/admin/audit'),
  ])
  const campuses: Campus[] = campusResponse.data.campuses.map((campus: any) => ({
    id: campus.id, code: campus.code, name: campus.name,
    city: String(campus.address?.city ?? ''), address: String(campus.address?.line1 ?? ''),
    contact: campus.contact_email ?? campus.contact_phone_e164 ?? '', status: campus.status,
    canteens: campus.canteens.length, students: 0,
  }))
  const canteens: Canteen[] = campusResponse.data.campuses.flatMap((campus: any) => campus.canteens.map((canteen: any) => ({
    id: canteen.id, code: canteen.code, name: canteen.name, campusId: campus.id, campus: campus.name,
    status: canteen.status, outlets: Number(canteen.outlets), admins: Number(canteen.admins), modules: Number(canteen.modules),
    setupProgress: canteen.status === 'active' ? 100 : 0, ordersToday: Number(canteen.orders_today),
    health: canteen.outlet_records.some((outlet: any) => outlet.status === 'active') ? 'healthy' : 'offline',
    supportEmail: canteen.support_email ?? '', supportPhone: canteen.support_phone ?? '',
  })))
  const modules: FeatureModule[] = featureResponse.data.features.map((feature: any) => ({
    code: feature.code, name: feature.name, shortName: feature.code.replaceAll('_', ' '), description: feature.description,
    category: ['pos', 'student_ordering', 'qr_ordering'].includes(feature.code) ? 'Ordering'
      : ['kot', 'kds', 'printing', 'inventory'].includes(feature.code) ? 'Operations' : 'Commerce',
    dependency: feature.code === 'kds' || feature.code === 'printing' ? 'kot' : feature.code === 'qr_ordering' ? 'student_ordering' : undefined,
    enabledFor: feature.enabled_for, status: ['online_payments', 'wallet'].includes(feature.code) ? 'planned' : 'ready',
  }))
  const team: TeamMember[] = teamResponse.data.team.map((member: any) => ({
    id: member.id, name: member.display_name, email: member.email ?? '',
    initials: member.display_name.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
    role: member.roles.join(', ') || 'Unassigned', scope: member.scopes.join(', ') || 'None', status: member.status,
    lastSeen: elapsed(member.last_seen_at), mfa: false,
  }))
  const roles: RoleDefinition[] = roleResponse.data.roles.map((role: any) => ({
    id: role.id, name: role.name, description: `${role.scope_type} role`, members: Number(role.members),
    permissions: role.permissions, system: role.is_system,
  }))
  const alerts: OperationAlert[] = operationResponse.data.alerts.map((alert: any) => ({
    id: alert.id, severity: alert.severity, title: alert.title, detail: alert.detail, canteen: alert.canteen,
    age: elapsed(alert.occurred_at), kind: alert.kind,
  }))
  const audit: AuditEntry[] = auditResponse.data.audit.map((entry: any) => ({
    id: entry.id, actor: entry.actor, action: entry.action, target: entry.target, scope: entry.scope,
    time: new Date(entry.occurred_at).toLocaleString(), risk: entry.risk_level ?? 'normal',
  }))
  return { campuses, canteens, modules, team, roles, alerts, audit }
}
