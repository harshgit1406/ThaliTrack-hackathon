import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  Filter,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MonitorCog,
  MoreHorizontal,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  TicketCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import mealyLogo from '../../pos/src/assets/mealy-logo.png'
import { permissionGroups } from './data'
import { validateModuleToggle } from './lib/entitlements'
import { createCampus, loadAdminSnapshot, onboardCanteen, setCanteenFeature } from './services/admin-service'
import type { AdminView, AuditEntry, Campus, Canteen, FeatureModule, OperationAlert, RoleDefinition, TeamMember } from './types'

const navGroups: Array<{ label: string; items: Array<{ id: AdminView; label: string; icon: typeof LayoutDashboard }> }> = [
  { label: 'Platform', items: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'campuses', label: 'Campuses', icon: Building2 },
    { id: 'canteens', label: 'Canteens', icon: Store },
    { id: 'modules', label: 'Modules', icon: PackageCheck },
  ] },
  { label: 'Access', items: [
    { id: 'team', label: 'Mealy team', icon: Users },
    { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck },
  ] },
  { label: 'Oversight', items: [
    { id: 'operations', label: 'Operations monitor', icon: Activity },
    { id: 'audit', label: 'Audit log', icon: FileClock },
    { id: 'settings', label: 'Platform settings', icon: Settings },
  ] },
]

const viewCopy: Record<AdminView, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: 'Platform overview', title: 'Platform overview', description: 'Live operational data across the Mealy network.' },
  campuses: { eyebrow: 'Network setup', title: 'Campuses', description: 'Create and manage the colleges and campuses where Mealy operates.' },
  canteens: { eyebrow: 'Partner operations', title: 'Canteens', description: 'Onboard canteen organizations and control their platform access.' },
  modules: { eyebrow: 'Product control', title: 'Modules & entitlements', description: 'Decide which Mealy capabilities each canteen can access.' },
  team: { eyebrow: 'Platform access', title: 'Mealy team', description: 'Invite internal team members and control where they can work.' },
  roles: { eyebrow: 'Access policy', title: 'Roles & permissions', description: 'Define reusable permission sets for the Mealy operations team.' },
  operations: { eyebrow: 'Live oversight', title: 'Operations monitor', description: 'Spot delayed KOTs, device failures and synchronization risks.' },
  audit: { eyebrow: 'Security & compliance', title: 'Audit log', description: 'Review sensitive changes made across the platform.' },
  settings: { eyebrow: 'Platform defaults', title: 'Platform settings', description: 'Set safe defaults without overriding canteen operations.' },
}

type ModalType = 'campus' | 'canteen' | 'invite' | null

export default function App() {
  const [view, setView] = useState<AdminView>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [modal, setModal] = useState<ModalType>(null)
  const [selectedCanteenId, setSelectedCanteenId] = useState<string | null>(null)
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [canteens, setCanteens] = useState<Canteen[]>([])
  const [modules, setModules] = useState<FeatureModule[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [roles, setRoles] = useState<RoleDefinition[]>([])
  const [operationAlerts, setOperationAlerts] = useState<OperationAlert[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const selectedCanteen = canteens.find((canteen) => canteen.id === selectedCanteenId) ?? null

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const snapshot = await loadAdminSnapshot()
      setCampuses(snapshot.campuses)
      setCanteens(snapshot.canteens)
      setModules(snapshot.modules)
      setTeam(snapshot.team)
      setRoles(snapshot.roles)
      setOperationAlerts(snapshot.alerts)
      setAuditEntries(snapshot.audit)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Live administration data could not load.')
    }
  }, [notify])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const navigate = (next: AdminView) => {
    setView(next)
    setSidebarOpen(false)
    setGlobalQuery('')
  }

  const addCampus = async (campus: Campus) => {
    try {
      await createCampus({ code: campus.code, name: campus.name })
      setModal(null)
      await refresh()
      notify(`${campus.name} was created.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Campus creation failed.')
    }
  }

  const addCanteen = async (canteen: Canteen, selectedModules: string[]) => {
    try {
      const canteenId = await onboardCanteen({ campusId: canteen.campusId, code: canteen.code, name: canteen.name, outletName: `${canteen.name} main outlet` })
      for (const featureCode of selectedModules) await setCanteenFeature(canteenId, featureCode, true)
      setModal(null)
      await refresh()
      notify(`${canteen.name} is ready for onboarding.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Canteen onboarding failed.')
    }
  }

  const addTeamMember = (member: TeamMember) => {
    setModal(null)
    notify(`Invitation for ${member.email} was not saved because the team invitation API is not implemented.`)
  }

  const toggleModule = async (canteenId: string, featureCode: string) => {
    const feature = modules.find((item) => item.code === featureCode)
    if (!feature) return
    const isEnabled = feature.enabledFor.includes(canteenId)
    const validation = validateModuleToggle(modules, canteenId, featureCode)
    if (!validation.allowed) {
      notify(validation.message)
      return
    }
    try {
      await setCanteenFeature(canteenId, featureCode, !isEnabled)
      await refresh()
      notify(`${feature.name} ${isEnabled ? 'disabled' : 'enabled'}.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Module update failed.')
    }
  }

  const content = (() => {
    switch (view) {
      case 'overview': return <Overview canteens={canteens} campuses={campuses} alerts={operationAlerts} audit={auditEntries} onNavigate={navigate} onCreateCanteen={() => setModal('canteen')} onInvite={() => setModal('invite')} />
      case 'campuses': return <CampusesPage campuses={campuses} canteens={canteens} query={globalQuery} onCreate={() => setModal('campus')} onSelect={(id) => { const match = canteens.find((canteen) => canteen.campusId === id); if (match) setSelectedCanteenId(match.id) }} />
      case 'canteens': return <CanteensPage canteens={canteens} query={globalQuery} onCreate={() => setModal('canteen')} onSelect={setSelectedCanteenId} />
      case 'modules': return <ModulesPage canteens={canteens} modules={modules} onToggle={toggleModule} />
      case 'team': return <TeamPage team={team} query={globalQuery} onInvite={() => setModal('invite')} onAction={notify} />
      case 'roles': return <RolesPage roles={roles} onChange={setRoles} onNotify={notify} />
      case 'operations': return <OperationsPage alerts={operationAlerts} onNotify={notify} onRefresh={() => void refresh()} />
      case 'audit': return <AuditPage entries={auditEntries} query={globalQuery} />
      case 'settings': return <SettingsPage onNotify={notify} />
    }
  })()

  return (
    <div className="admin-shell">
      <Sidebar view={view} open={sidebarOpen} onNavigate={navigate} onClose={() => setSidebarOpen(false)} />
      <div className="admin-main">
        <Topbar query={globalQuery} onQuery={setGlobalQuery} onMenu={() => setSidebarOpen(true)} onNotify={notify} />
        <main className="page-content">
          <div className="page-heading">
            <div>
              <span>{viewCopy[view].eyebrow}</span>
              <h1>{viewCopy[view].title}</h1>
              <p>{viewCopy[view].description}</p>
            </div>
            <div className="demo-pill"><span /> Live backend data</div>
          </div>
          {content}
        </main>
      </div>

      {modal === 'campus' && <CampusModal onClose={() => setModal(null)} onCreate={addCampus} />}
      {modal === 'canteen' && <CanteenWizard campuses={campuses} modules={modules} onClose={() => setModal(null)} onCreate={addCanteen} />}
      {modal === 'invite' && <InviteModal roles={roles} onClose={() => setModal(null)} onInvite={addTeamMember} />}
      {selectedCanteen && <CanteenDrawer canteen={selectedCanteen} modules={modules} onClose={() => setSelectedCanteenId(null)} onModules={() => { setSelectedCanteenId(null); navigate('modules') }} onNotify={notify} />}
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  )
}

function Sidebar({ view, open, onNavigate, onClose }: { view: AdminView; open: boolean; onNavigate: (view: AdminView) => void; onClose: () => void }) {
  return <>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand"><img src={mealyLogo} alt="Mealy" /><span>Platform admin</span></div>
      <nav aria-label="Platform admin navigation">
        {navGroups.map((group) => <div className="nav-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={18} /><span>{label}</span>
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-help">
        <div><HelpCircle size={18} /><strong>Need help?</strong></div>
        <p>Review admin controls and platform responsibilities.</p>
        <button>Open guide <ArrowRight size={14} /></button>
      </div>
      <div className="sidebar-user">
        <div className="avatar">PA</div>
        <div><strong>Platform account</strong><span>Scope comes from the signed-in session</span></div>
        <MoreHorizontal size={17} />
      </div>
    </aside>
  </>
}

function Topbar({ query, onQuery, onMenu, onNotify }: { query: string; onQuery: (value: string) => void; onMenu: () => void; onNotify: (message: string) => void }) {
  return <header className="topbar">
    <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={21} /></button>
    <label className="global-search"><Search size={18} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search the current page" /><kbd>⌘ K</kbd></label>
    <div className="topbar-actions">
      <div className="live-state"><span /> Platform online</div>
      <button className="icon-button" aria-label="Refresh live data" onClick={() => onNotify('Use the current page refresh to reload backend data.')}><RefreshCw size={18} /></button>
      <button className="icon-button" aria-label="Notifications" onClick={() => onNotify('Open Operations to review backend-reported alerts.')}><Bell size={19} /></button>
    </div>
  </header>
}

function Overview({ canteens, campuses, alerts, audit, onNavigate, onCreateCanteen, onInvite }: { canteens: Canteen[]; campuses: Campus[]; alerts: OperationAlert[]; audit: AuditEntry[]; onNavigate: (view: AdminView) => void; onCreateCanteen: () => void; onInvite: () => void }) {
  const activeCanteens = canteens.filter((canteen) => canteen.status === 'active').length
  const totalOrders = canteens.reduce((sum, canteen) => sum + canteen.ordersToday, 0)
  const onboarding = canteens.filter((canteen) => canteen.status === 'onboarding')
  return <div className="stack-xl">
    <div className="quick-actions">
      <button className="primary-button" onClick={onCreateCanteen}><Plus size={17} /> Add canteen</button>
      <button className="secondary-button" onClick={onInvite}><UserPlus size={17} /> Invite team member</button>
    </div>
    <section className="stats-grid" aria-label="Platform summary">
      <StatCard icon={<Building2 />} label="Active campuses" value={String(campuses.filter((campus) => campus.status === 'active').length)} note={`${campuses.length} total campuses`} tone="blue" />
      <StatCard icon={<Store />} label="Active canteens" value={String(activeCanteens)} note={`${onboarding.length} onboarding`} tone="orange" />
      <StatCard icon={<TicketCheck />} label="Orders today" value={totalOrders.toLocaleString('en-IN')} note="Across active canteens" tone="green" />
      <StatCard icon={<AlertTriangle />} label="Needs attention" value={String(alerts.length)} note={`${alerts.filter((alert) => alert.severity === 'critical').length} critical`} tone="red" />
    </section>

    <div className="overview-grid">
      <section className="panel wide-panel">
        <PanelHeading title="Network activity" subtitle="Order volume across active canteens" action={<button onClick={() => onNavigate('operations')}>Open monitor <ArrowRight size={14} /></button>} />
        <EmptyState icon={<Activity />} title="No hourly series available" text="The current operations API returns live totals and alerts, but not time-series data." />
      </section>
      <section className="panel">
        <PanelHeading title="Operational attention" subtitle="Items requiring review" action={<button onClick={() => onNavigate('operations')}>View all</button>} />
        <div className="alert-list compact">
          {alerts.slice(0, 3).map((alert) => <div className="alert-row" key={alert.id}>
            <span className={`severity-dot ${alert.severity}`} />
            <div><strong>{alert.title}</strong><span>{alert.canteen} · {alert.age}</span></div>
            <ChevronRight size={16} />
          </div>)}
        </div>
      </section>
    </div>

    <div className="overview-grid equal">
      <section className="panel">
        <PanelHeading title="Onboarding progress" subtitle="Canteens not yet active" action={<button onClick={() => onNavigate('canteens')}>Manage</button>} />
        <div className="progress-list">
          {onboarding.map((canteen) => <button key={canteen.id} onClick={() => onNavigate('canteens')}>
            <div className="list-avatar store"><Store size={17} /></div>
            <div><strong>{canteen.name}</strong><span>{canteen.campus}</span><div className="progress-track"><i style={{ width: `${canteen.setupProgress}%` }} /></div></div>
            <b>{canteen.setupProgress}%</b>
          </button>)}
        </div>
      </section>
      <section className="panel">
        <PanelHeading title="Recent platform changes" subtitle="Security-relevant activity" action={<button onClick={() => onNavigate('audit')}>Audit log</button>} />
        <div className="activity-list">
          {audit.slice(0, 3).map((entry) => <div key={entry.id}><div className="list-avatar"><FileClock size={16} /></div><div><strong>{entry.action}</strong><span>{entry.actor} · {entry.target}</span></div><time>{entry.time.split(',')[0]}</time></div>)}
        </div>
      </section>
    </div>
  </div>
}

function StatCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>
}

function CampusesPage({ campuses, canteens, query, onCreate, onSelect }: { campuses: Campus[]; canteens: Canteen[]; query: string; onCreate: () => void; onSelect: (id: string) => void }) {
  const [status, setStatus] = useState('all')
  const filtered = campuses.filter((campus) => (status === 'all' || campus.status === status) && `${campus.name} ${campus.city} ${campus.code}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel data-panel">
    <div className="toolbar">
      <div className="segmented">{['all', 'active', 'draft', 'suspended'].map((item) => <button className={status === item ? 'selected' : ''} onClick={() => setStatus(item)} key={item}>{item === 'all' ? 'All campuses' : item}</button>)}</div>
      <button className="primary-button" onClick={onCreate}><Plus size={17} /> Add campus</button>
    </div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Campus</th><th>Status</th><th>Canteens</th><th>Students</th><th>Contact</th><th /></tr></thead>
        <tbody>{filtered.map((campus) => <tr key={campus.id}>
          <td><button className="entity-cell" onClick={() => onSelect(campus.id)}><span className="entity-icon"><Building2 size={18} /></span><span><strong>{campus.name}</strong><small>{campus.code} · {campus.city}</small></span></button></td>
          <td><StatusPill status={campus.status} /></td><td>{canteens.filter((canteen) => canteen.campusId === campus.id).length}</td><td>{campus.students.toLocaleString('en-IN')}</td><td><span className="muted-cell">{campus.contact}</span></td><td><button className="table-action" aria-label={`More actions for ${campus.name}`}><MoreHorizontal size={18} /></button></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <EmptyState icon={<Search />} title="No campuses found" text="Try a different search or status filter." />}
    </div>
    <TableFooter count={filtered.length} label="campuses" />
  </section>
}

function CanteensPage({ canteens, query, onCreate, onSelect }: { canteens: Canteen[]; query: string; onCreate: () => void; onSelect: (id: string) => void }) {
  const [status, setStatus] = useState('all')
  const filtered = canteens.filter((canteen) => (status === 'all' || canteen.status === status) && `${canteen.name} ${canteen.campus} ${canteen.code}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel data-panel">
    <div className="toolbar">
      <div className="segmented">{['all', 'active', 'onboarding', 'suspended'].map((item) => <button className={status === item ? 'selected' : ''} onClick={() => setStatus(item)} key={item}>{item === 'all' ? 'All canteens' : item}</button>)}</div>
      <button className="primary-button" onClick={onCreate}><Plus size={17} /> Add canteen</button>
    </div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Canteen</th><th>Status</th><th>Setup</th><th>Modules</th><th>Orders today</th><th>Health</th><th /></tr></thead>
        <tbody>{filtered.map((canteen) => <tr key={canteen.id}>
          <td><button className="entity-cell" onClick={() => onSelect(canteen.id)}><span className="entity-icon orange"><Store size={18} /></span><span><strong>{canteen.name}</strong><small>{canteen.code} · {canteen.campus}</small></span></button></td>
          <td><StatusPill status={canteen.status} /></td><td><div className="inline-progress"><span><i style={{ width: `${canteen.setupProgress}%` }} /></span><b>{canteen.setupProgress}%</b></div></td><td>{canteen.modules}</td><td>{canteen.ordersToday.toLocaleString('en-IN')}</td><td><Health status={canteen.health} /></td><td><button className="table-action" onClick={() => onSelect(canteen.id)} aria-label={`View ${canteen.name}`}><ChevronRight size={18} /></button></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <EmptyState icon={<Search />} title="No canteens found" text="Try a different search or status filter." />}
    </div>
    <TableFooter count={filtered.length} label="canteens" />
  </section>
}

function ModulesPage({ canteens, modules, onToggle }: { canteens: Canteen[]; modules: FeatureModule[]; onToggle: (canteenId: string, featureCode: string) => void }) {
  const [canteenId, setCanteenId] = useState(canteens[0]?.id ?? '')
  const canteen = canteens.find((item) => item.id === canteenId)
  return <div className="stack-lg">
    <section className="module-context panel">
      <div className="context-icon"><SlidersHorizontal size={21} /></div>
      <div><span>Configure modules for</span><div className="select-wrap"><select value={canteenId} onChange={(event) => setCanteenId(event.target.value)}>{canteens.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.campus}</option>)}</select><ChevronDown size={16} /></div></div>
      <div className="context-summary"><strong>{modules.filter((module) => module.enabledFor.includes(canteenId)).length}</strong><span>enabled modules</span></div>
    </section>
    <div className="policy-note"><ShieldCheck size={19} /><div><strong>Entitlements are platform-controlled</strong><span>Canteen admins can configure enabled modules, but cannot enable new ones themselves.</span></div></div>
    {(['Ordering', 'Operations', 'Commerce'] as const).map((category) => <section key={category}>
      <div className="section-label"><h2>{category}</h2><span>{modules.filter((module) => module.category === category).length} modules</span></div>
      <div className="module-grid">
        {modules.filter((module) => module.category === category).map((module) => {
          const enabled = module.enabledFor.includes(canteenId)
          return <article className={`module-card ${enabled ? 'enabled' : ''} ${module.status === 'planned' ? 'planned' : ''}`} key={module.code}>
            <div className="module-card-top"><div className="module-monogram">{module.shortName.slice(0, 2)}</div><Toggle checked={enabled} disabled={module.status === 'planned'} label={`${enabled ? 'Disable' : 'Enable'} ${module.name}`} onChange={() => onToggle(canteenId, module.code)} /></div>
            <h3>{module.name}</h3><p>{module.description}</p>
            <div className="module-meta">{module.status === 'planned' ? <span className="planned-tag"><Clock3 size={12} /> Awaiting product approval</span> : enabled ? <span className="enabled-tag"><Check size={12} /> Enabled</span> : <span>Not assigned</span>}{module.dependency && <small>Requires {modules.find((item) => item.code === module.dependency)?.shortName}</small>}</div>
          </article>
        })}
      </div>
    </section>)}
    {canteen && <p className="footnote">Live module assignments for <strong>{canteen.name}</strong>. Changes are sent to the backend and recorded in the audit log.</p>}
  </div>
}

function TeamPage({ team, query, onInvite, onAction }: { team: TeamMember[]; query: string; onInvite: () => void; onAction: (message: string) => void }) {
  const filtered = team.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel data-panel">
    <div className="toolbar"><div className="toolbar-copy"><strong>{team.filter((member) => member.status === 'active').length} active members</strong><span>Access is limited by role and scope.</span></div><button className="primary-button" onClick={onInvite}><UserPlus size={17} /> Invite member</button></div>
    <div className="table-wrap"><table><thead><tr><th>Team member</th><th>Role</th><th>Scope</th><th>Security</th><th>Status</th><th>Last active</th><th /></tr></thead>
      <tbody>{filtered.map((member) => <tr key={member.id}><td><div className="entity-cell"><span className="member-avatar">{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td><td><span className="role-chip">{member.role}</span></td><td>{member.scope}</td><td>{member.mfa ? <span className="mfa good"><ShieldCheck size={14} /> MFA on</span> : <button className="mfa warn" onClick={() => onAction(`MFA reminder sent to ${member.name}.`)}><AlertTriangle size={14} /> MFA off</button>}</td><td><StatusPill status={member.status} /></td><td><span className="muted-cell">{member.lastSeen}</span></td><td><button className="table-action" onClick={() => onAction(`Access actions opened for ${member.name}.`)} aria-label={`Manage ${member.name}`}><MoreHorizontal size={18} /></button></td></tr>)}</tbody>
    </table></div><TableFooter count={filtered.length} label="team members" />
  </section>
}

function RolesPage({ roles, onChange, onNotify }: { roles: RoleDefinition[]; onChange: (roles: RoleDefinition[]) => void; onNotify: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(roles[1]?.id ?? roles[0]?.id)
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0]
  if (!selected) return <EmptyState icon={<ShieldCheck />} title="No roles returned" text="Create roles through the backend before managing permissions." />
  const isLocked = selected.id === 'role-super'
  const togglePermission = (permission: string) => {
    if (isLocked) return
    onChange(roles.map((role) => role.id === selected.id ? { ...role, permissions: role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission] } : role))
  }
  return <div className="roles-layout">
    <section className="panel role-list">
      <div className="role-list-heading"><div><h2>Platform roles</h2><p>{roles.length} permission sets</p></div><button onClick={() => onNotify('Custom-role creation will be connected with the backend.')}><Plus size={16} /></button></div>
      {roles.map((role) => <button className={selected.id === role.id ? 'selected' : ''} onClick={() => setSelectedId(role.id)} key={role.id}><div><strong>{role.name}</strong><span>{role.description}</span><small><Users size={12} /> {role.members} {role.members === 1 ? 'member' : 'members'} {role.system && '· System role'}</small></div><ChevronRight size={17} /></button>)}
    </section>
    <section className="panel permission-panel">
      <div className="permission-heading"><div><span>Editing role</span><h2>{selected.name}</h2><p>{selected.description}</p></div>{isLocked && <span className="locked-pill"><LockKeyhole size={14} /> Protected</span>}</div>
      {isLocked && <div className="locked-note"><ShieldCheck size={18} />The Super Admin role always has every permission and cannot be reduced.</div>}
      <div className="permission-groups">
        {permissionGroups.map((group) => <div key={group.name}><h3>{group.name}</h3><div>{group.permissions.map((permission) => {
          const checked = isLocked || selected.permissions.includes(permission) || selected.permissions.includes('All permissions')
          return <label key={permission}><input type="checkbox" checked={checked} disabled onChange={() => togglePermission(permission)} /><span><Check size={13} /></span>{permission}</label>
        })}</div></div>)}
      </div>
      <div className="permission-footer"><span>Role permission writes are not available in the backend yet.</span><button className="primary-button" onClick={() => onNotify('Role changes require a backend write endpoint.')} disabled>Save permissions</button></div>
    </section>
  </div>
}

function OperationsPage({ alerts, onNotify, onRefresh }: { alerts: OperationAlert[]; onNotify: (message: string) => void; onRefresh: () => void }) {
  const [filter, setFilter] = useState('All')
  const filtered = alerts.filter((alert) => filter === 'All' || alert.kind === filter)
  return <div className="stack-lg">
    <div className="monitor-strip"><div><span className="pulse" /><span><strong>Live operations feed</strong><small>{alerts.length} backend-reported alert{alerts.length === 1 ? '' : 's'}</small></span></div></div>
    <div className="operations-grid">
      <section className="panel incident-panel">
        <div className="toolbar"><div className="segmented">{['All', 'KOT', 'Order', 'Device', 'Sync'].map((item) => <button className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><button className="secondary-button" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button></div>
        <div className="incident-list">{filtered.map((alert) => <article key={alert.id}>
          <div className={`incident-icon ${alert.severity}`}>{alert.severity === 'critical' ? <WifiOff /> : alert.kind === 'KOT' ? <TicketCheck /> : alert.kind === 'Device' ? <MonitorCog /> : <AlertTriangle />}</div>
          <div><div className="incident-title"><span className={`severity-label ${alert.severity}`}>{alert.severity}</span><small>{alert.kind}</small></div><h3>{alert.title}</h3><p>{alert.detail}</p><span>{alert.canteen} · {alert.age} ago</span></div>
          <button onClick={() => onNotify(`${alert.title} acknowledged for investigation.`)}>Acknowledge</button>
        </article>)}</div>
      </section>
      <aside className="stack-lg">
        <section className="panel health-panel"><PanelHeading title="Service health" subtitle="Health telemetry is not exposed by the current API" /><EmptyState icon={<Wifi />} title="No service telemetry returned" text="No placeholder latency or device-health values are shown." /></section>
        <div className="boundary-card"><ShieldCheck size={22} /><h3>Oversight, not kitchen control</h3><p>Platform admins can investigate and acknowledge issues. Preparing, completing or cancelling KOTs remains a canteen operation.</p></div>
      </aside>
    </div>
  </div>
}

function AuditPage({ entries, query }: { entries: AuditEntry[]; query: string }) {
  const [risk, setRisk] = useState('all')
  const filtered = entries.filter((entry) => (risk === 'all' || entry.risk === risk) && `${entry.actor} ${entry.action} ${entry.target} ${entry.scope}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel data-panel">
    <div className="toolbar"><div className="filter-select"><Filter size={15} /><select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="all">All risk levels</option><option value="normal">Normal</option><option value="sensitive">Sensitive</option><option value="critical">Critical</option></select><ChevronDown size={14} /></div><button className="secondary-button"><Archive size={15} /> Export log</button></div>
    <div className="table-wrap"><table><thead><tr><th>Activity</th><th>Actor</th><th>Scope</th><th>Risk</th><th>Time</th><th /></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id}><td><div className="audit-action"><span className={`risk-icon ${entry.risk}`}><FileClock size={16} /></span><div><strong>{entry.action}</strong><small>{entry.target}</small></div></div></td><td>{entry.actor}</td><td>{entry.scope}</td><td><span className={`risk-pill ${entry.risk}`}>{entry.risk}</span></td><td><span className="muted-cell">{entry.time}</span></td><td><button className="table-action"><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div>
    <TableFooter count={filtered.length} label="audit entries" />
  </section>
}

function SettingsPage({ onNotify }: { onNotify: (message: string) => void }) {
  return <section className="panel settings-panel"><div className="settings-heading"><span><Settings /></span><div><h2>Platform settings</h2><p>The backend does not expose platform settings yet, so no placeholder defaults are displayed.</p></div></div><EmptyState icon={<SlidersHorizontal />} title="No settings returned" text="Add the settings read/write contract before enabling these controls." /><button className="primary-button" onClick={() => onNotify('Platform settings require a backend endpoint.')} disabled>Save settings</button></section>
}

function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status}`}><i />{status}</span> }
function Health({ status }: { status: Canteen['health'] }) { return <span className={`health ${status}`}><i />{status}</span> }
function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'on' : ''}`} onClick={onChange}><span /></button> }
function TableFooter({ count, label }: { count: number; label: string }) { return <div className="table-footer"><span>Showing {count} {label}</span><div><button disabled><ChevronLeft size={15} /></button><b>1</b><button disabled><ChevronRight size={15} /></button></div></div> }
function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="empty-state">{icon}<h3>{title}</h3><p>{text}</p></div> }

function ModalFrame({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer" role="presentation"><button className="modal-backdrop" aria-label="Close dialog" onClick={onClose} /><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>{children}</section></div>
}

function CampusModal({ onClose, onCreate }: { onClose: () => void; onCreate: (campus: Campus) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '')
    onCreate({ id: `campus-${Date.now()}`, code: String(data.get('code') ?? '').toUpperCase(), name, city: String(data.get('city') ?? ''), address: String(data.get('address') ?? ''), contact: String(data.get('contact') ?? ''), status: 'draft', canteens: 0, students: 0 })
  }
  return <ModalFrame title="Add campus" subtitle="Create the college or campus record where Mealy will operate." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Campus or college name<input name="name" placeholder="e.g. Delhi Technological University" required minLength={2} /></label><div className="form-row"><label>Campus code<input name="code" placeholder="DTU-DEL" required pattern="[A-Za-z0-9_-]{2,32}" /></label><label>City<input name="city" placeholder="Delhi" required /></label></div><label>Address<input name="address" placeholder="Campus address" required /></label><label>Operations contact<input name="contact" type="email" placeholder="operations@college.edu" required /></label><div className="info-box"><Building2 size={18} /><span>This creates a draft campus. Add and activate its canteens separately.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Create draft campus</button></div></form></ModalFrame>
}

function InviteModal({ roles, onClose, onInvite }: { roles: RoleDefinition[]; onClose: () => void; onInvite: (member: TeamMember) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '')
    onInvite({ id: `team-${Date.now()}`, name, email: String(data.get('email') ?? ''), initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), role: String(data.get('role') ?? ''), scope: String(data.get('scope') ?? ''), status: 'invited', lastSeen: 'Invite sent now', mfa: false })
  }
  return <ModalFrame title="Invite Mealy team member" subtitle="Grant internal platform access with a defined role and scope." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Full name<input name="name" placeholder="Team member name" required /></label><label>Work email<input name="email" type="email" placeholder="name@mealy.app" required /></label><div className="form-row"><label>Role<select name="role" defaultValue="Operations Admin">{roles.filter((role) => role.id !== 'role-super').map((role) => <option key={role.id}>{role.name}</option>)}</select></label><label>Access scope<select name="scope" defaultValue="All campuses"><option>All campuses</option><option>Delhi NCR</option><option>Selected campuses</option><option>Read only</option></select></label></div><div className="info-box"><ShieldCheck size={18} /><span>The invitation grants only the selected role and scope. MFA can be enforced after acceptance.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Send invitation</button></div></form></ModalFrame>
}

function CanteenWizard({ campuses, modules, onClose, onCreate }: { campuses: Campus[]; modules: FeatureModule[]; onClose: () => void; onCreate: (canteen: Canteen, modules: string[]) => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ campusId: campuses.find((campus) => campus.status === 'active')?.id ?? campuses[0]?.id ?? '', name: '', code: '', email: '', phone: '', outlet: '', adminName: '', adminEmail: '', modules: ['pos', 'kot', 'printing'] })
  const campus = campuses.find((item) => item.id === form.campusId)
  const toggleFeature = (code: string) => {
    const feature = modules.find((item) => item.code === code)
    if (!feature || feature.status === 'planned') return
    if (!form.modules.includes(code) && feature.dependency && !form.modules.includes(feature.dependency)) return
    if (form.modules.includes(code) && modules.some((item) => item.dependency === code && form.modules.includes(item.code))) return
    setForm((current) => ({ ...current, modules: current.modules.includes(code) ? current.modules.filter((item) => item !== code) : [...current.modules, code] }))
  }
  const canContinue = step === 1 ? Boolean(form.campusId) : step === 2 ? Boolean(form.name && form.code && form.email) : step === 3 ? Boolean(form.outlet && form.adminName && form.adminEmail) : true
  const finish = () => onCreate({ id: `ct-${Date.now()}`, code: form.code.toUpperCase(), name: form.name, campusId: form.campusId, campus: campus?.name ?? 'Unassigned campus', status: 'onboarding', outlets: 1, admins: 1, modules: form.modules.length, setupProgress: 52, ordersToday: 0, health: 'offline', supportEmail: form.email, supportPhone: form.phone || 'Not provided' }, form.modules)
  return <ModalFrame title="Onboard a canteen" subtitle="Create the operating organization, assign its first outlet and choose modules." onClose={onClose} wide>
    <div className="wizard-steps">{['Campus', 'Canteen', 'First outlet', 'Modules'].map((label, index) => <div className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} key={label}><span>{step > index + 1 ? <Check size={13} /> : index + 1}</span><b>{label}</b></div>)}</div>
    <div className="wizard-body">
      {step === 1 && <div className="wizard-section"><h3>Where will this canteen operate?</h3><p>Select an active college or campus. One canteen can be assigned to more campuses later.</p><div className="campus-options">{campuses.map((item) => <button className={form.campusId === item.id ? 'selected' : ''} disabled={item.status !== 'active'} onClick={() => setForm({ ...form, campusId: item.id })} key={item.id}><span className="entity-icon"><Building2 size={18} /></span><span><strong>{item.name}</strong><small>{item.city} · {item.code}</small></span>{form.campusId === item.id && <CheckCircle2 size={19} />}{item.status !== 'active' && <StatusPill status={item.status} />}</button>)}</div></div>}
      {step === 2 && <div className="wizard-section"><h3>Canteen identity</h3><p>Enter the organization details used by platform operators and support.</p><div className="form-grid"><label className="span-2">Canteen name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Central Canteen" /></label><label>Canteen code<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} placeholder="NSUT-CC" /></label><label>Support phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" /></label><label className="span-2">Support email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="manager@canteen.example" /></label></div></div>}
      {step === 3 && <div className="wizard-section"><h3>First outlet and administrator</h3><p>Create the initial operating location and invite its responsible administrator.</p><div className="form-grid"><label className="span-2">Outlet name<input value={form.outlet} onChange={(event) => setForm({ ...form, outlet: event.target.value })} placeholder="e.g. Main campus counter" /></label><label>Administrator name<input value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} placeholder="Full name" /></label><label>Administrator email<input type="email" value={form.adminEmail} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} placeholder="admin@canteen.example" /></label></div><div className="info-box"><UserPlus size={18} /><span>The canteen administrator gets canteen-scoped access only. Mealy team permissions are managed separately.</span></div></div>}
      {step === 4 && <div className="wizard-section"><h3>Choose initial modules</h3><p>At least one order-entry channel should be enabled before activation. KDS and printing depend on KOT.</p><div className="wizard-modules">{modules.map((module) => { const selected = form.modules.includes(module.code); const unavailable = module.status === 'planned' || Boolean(module.dependency && !form.modules.includes(module.dependency)); return <button className={selected ? 'selected' : ''} disabled={unavailable} onClick={() => toggleFeature(module.code)} key={module.code}><span className="module-monogram">{module.shortName.slice(0, 2)}</span><span><strong>{module.name}</strong><small>{module.status === 'planned' ? 'Awaiting product approval' : module.dependency ? `Requires ${modules.find((item) => item.code === module.dependency)?.shortName}` : module.description}</small></span><i>{selected && <Check size={13} />}</i></button>})}</div></div>}
    </div>
    <div className="wizard-footer"><button className="secondary-button" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? 'Cancel' : 'Back'}</button><span>Step {step} of 4</span><button className="primary-button" disabled={!canContinue} onClick={step === 4 ? finish : () => setStep(step + 1)}>{step === 4 ? 'Create canteen' : <>Continue <ArrowRight size={16} /></>}</button></div>
  </ModalFrame>
}

function CanteenDrawer({ canteen, modules, onClose, onModules, onNotify }: { canteen: Canteen; modules: FeatureModule[]; onClose: () => void; onModules: () => void; onNotify: (message: string) => void }) {
  const enabled = modules.filter((module) => module.enabledFor.includes(canteen.id))
  return <div className="drawer-layer"><button className="drawer-backdrop" aria-label="Close canteen details" onClick={onClose} /><aside className="drawer"><header><div className="drawer-title"><span className="entity-icon orange"><Store size={20} /></span><div><span>{canteen.code}</span><h2>{canteen.name}</h2></div></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header><div className="drawer-body">
    <div className="drawer-status"><StatusPill status={canteen.status} /><Health status={canteen.health} /></div>
    <section><h3>Campus assignment</h3><div className="detail-card"><Building2 size={18} /><div><strong>{canteen.campus}</strong><span>Primary campus assignment</span></div></div></section>
    <section><div className="drawer-section-heading"><h3>Onboarding</h3><strong>{canteen.setupProgress}%</strong></div><div className="large-progress"><i style={{ width: `${canteen.setupProgress}%` }} /></div><div className="checklist"><span className="done"><CheckCircle2 /> Organization created</span><span className="done"><CheckCircle2 /> First outlet added</span><span className={canteen.admins ? 'done' : ''}>{canteen.admins ? <CheckCircle2 /> : <Clock3 />} Administrator invited</span><span><Clock3 /> Device enrollment pending</span></div></section>
    <section><div className="drawer-section-heading"><h3>Enabled modules</h3><button onClick={onModules}>Manage</button></div><div className="chip-list">{enabled.map((module) => <span key={module.code}>{module.shortName}</span>)}</div></section>
    <section><h3>Support contact</h3><div className="contact-lines"><span>{canteen.supportEmail}</span><span>{canteen.supportPhone}</span></div></section>
    <div className="drawer-warning"><AlertTriangle size={18} /><div><strong>High-risk controls are protected</strong><span>Suspending access will require a reason and affect all assigned outlets.</span></div></div>
  </div><footer><button className="secondary-button" onClick={() => onNotify(`Support view opened for ${canteen.name}.`)}>Open support view</button><button className="danger-button" onClick={() => onNotify(`Suspension review opened for ${canteen.name}.`)}>Review suspension</button></footer></aside></div>
}
