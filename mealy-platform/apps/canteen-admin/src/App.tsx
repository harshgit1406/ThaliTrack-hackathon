import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Boxes,
  Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, CookingPot, Download, FileClock, Gauge, HelpCircle, History, IndianRupee,
  LayoutDashboard, LockKeyhole, Menu as MenuIcon, MonitorCog, MoreHorizontal, PackageOpen,
  Plus, ReceiptText, Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Store,
  TicketCheck, ToggleLeft, TrendingUp, UserPlus, Users, UtensilsCrossed, WifiOff, X,
} from 'lucide-react'
import mealyLogo from '../../pos/src/assets/mealy-logo.png'
import { aggregatePortfolio } from './lib/portfolio'
import { DevicesSetup, HoursEditor, KitchenSetup, TaxesSetup } from './SetupViews'
import { hoursSummary } from './lib/setup'
import { adjustMenuItemStock, createDemoManagementSession, createMenuItem, createStaffMember, hasManagementSession, loadForecast, loadManagementSetup, loadManagementSnapshot, loadRushBoard, logDishLeftover, publishSurplusOffer, setMenuItemAvailability, setOutletAcceptingOrders, transitionRushOrder } from './services/management-service'
import type { AdvancedView, AppMode, Canteen, ForecastReport, MainView, ManagementSetup, MenuItem, Order, Outlet, OwnerActivity, OwnerAlert, OwnerView, RushBoard, TeamMember } from './types'

const mainNav: Array<{ id: MainView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'records', label: 'Orders & records', icon: ReceiptText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'alerts', label: 'Alerts', icon: Bell },
]

const advancedGroups: Array<{ label: string; items: Array<{ id: AdvancedView; label: string; icon: typeof LayoutDashboard }> }> = [
  { label: 'Catalog', items: [
    { id: 'menu', label: 'Menu & items', icon: UtensilsCrossed },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
  ] },
  { label: 'Cafe setup', items: [
    { id: 'outlets', label: 'Outlets & hours', icon: Store },
    { id: 'kitchen', label: 'Kitchen setup', icon: CookingPot },
    { id: 'devices', label: 'Devices & printers', icon: MonitorCog },
    { id: 'team', label: 'Team & roles', icon: Users },
    { id: 'taxes', label: 'Taxes & charges', icon: CircleDollarSign },
  ] },
  { label: 'Control', items: [
    { id: 'modules', label: 'Modules', icon: PackageOpen },
    { id: 'activity', label: 'Activity log', icon: FileClock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] },
]

const copy: Record<OwnerView, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: 'Today at a glance', title: 'Canteen overview', description: 'A live view of what is happening across your canteens.' },
  records: { eyebrow: 'Daily records', title: 'Orders & records', description: 'Find orders, tokens and customer records without changing operations.' },
  reports: { eyebrow: 'Performance', title: 'Reports', description: 'Understand sales, order flow and menu performance.' },
  alerts: { eyebrow: 'Needs attention', title: 'Alerts', description: 'Review issues affecting your canteens and outlets.' },
  menu: { eyebrow: 'Advanced management', title: 'Menu & items', description: 'Manage prices, availability, categories and preparation details.' },
  inventory: { eyebrow: 'Advanced management', title: 'Inventory', description: 'Track ingredients, low stock and outlet-level movements.' },
  outlets: { eyebrow: 'Advanced management', title: 'Outlets & hours', description: 'Configure service locations, counters and ordering hours.' },
  kitchen: { eyebrow: 'Advanced management', title: 'Kitchen setup', description: 'Configure stations, KOT routing and preparation defaults.' },
  devices: { eyebrow: 'Advanced management', title: 'Devices & printers', description: 'Manage terminals, displays, printers and gateway health.' },
  team: { eyebrow: 'Advanced management', title: 'Team & roles', description: 'Control staff access across your canteens and outlets.' },
  taxes: { eyebrow: 'Advanced management', title: 'Taxes & charges', description: 'Configure tax treatment and service charges applied to orders.' },
  modules: { eyebrow: 'Advanced management', title: 'Mealy modules', description: 'Review capabilities assigned to this canteen by Mealy.' },
  activity: { eyebrow: 'Advanced management', title: 'Activity log', description: 'See who changed prices, availability and settings.' },
  settings: { eyebrow: 'Advanced management', title: 'Canteen settings', description: 'Manage business details, receipt defaults and notifications.' },
}

type Modal = 'choose-canteen' | 'item' | 'invite' | null

export default function App() {
  const [mode, setMode] = useState<AppMode>('main')
  const [view, setView] = useState<OwnerView>('overview')
  const [canteenId, setCanteenId] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [canteens, setCanteens] = useState<Canteen[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [alerts, setAlerts] = useState<OwnerAlert[]>([])
  const [activities, setActivities] = useState<OwnerActivity[]>([])
  const [setup, setSetup] = useState<ManagementSetup | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(() => hasManagementSession())

  const selectedCanteen = canteens.find((canteen) => canteen.id === canteenId)
  const stats = useMemo(() => aggregatePortfolio(canteens, orders, items, canteenId), [canteenId, canteens, items, orders])
  const scopedOrders = orders.filter((order) => canteenId === 'all' || order.canteenId === canteenId)
  const scopedItems = items.filter((item) => canteenId === 'all' || item.canteenId === canteenId)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    if (!authenticated) return
    try {
      const snapshot = await loadManagementSnapshot()
      setCanteens(snapshot.canteens)
      setOrders(snapshot.orders)
      setItems(snapshot.items)
      setOutlets(snapshot.outlets)
      setTeam(snapshot.team)
      setAlerts(snapshot.alerts)
      setActivities(snapshot.activities)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Live canteen data could not load.')
    }
  }, [authenticated, notify])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const refreshSetup = useCallback(async () => {
    if (canteenId === 'all') return
    try { setSetup(await loadManagementSetup(canteenId)) }
    catch (error) { notify(error instanceof Error ? error.message : 'Canteen setup could not load.') }
  }, [canteenId, notify])

  useEffect(() => {
    if (mode !== 'advanced' || canteenId === 'all') return
    const timer = window.setTimeout(() => void refreshSetup(), 0)
    return () => window.clearTimeout(timer)
  }, [canteenId, mode, refreshSetup])

  const enterAdvanced = () => {
    if (canteenId === 'all') {
      setModal('choose-canteen')
      return
    }
    setMode('advanced')
    setView('menu')
    setQuery('')
  }

  const enterMain = () => {
    setMode('main')
    setView('overview')
    setQuery('')
  }

  const chooseAdvancedCanteen = (id: string) => {
    setCanteenId(id)
    setModal(null)
    setMode('advanced')
    setView('menu')
    notify(`Advanced management opened for ${canteens.find((canteen) => canteen.id === id)?.name}.`)
  }

  const changeContext = (id: string) => {
    if (mode === 'advanced' && id === 'all') {
      notify('Select one canteen before editing its setup.')
      return
    }
    setCanteenId(id)
  }

  const navigate = (next: OwnerView) => {
    setView(next)
    setQuery('')
    setSidebarOpen(false)
  }

  const addItem = async (item: MenuItem) => {
    try {
      await createMenuItem(item.canteenId, item)
      setModal(null)
      await refresh()
      notify(`${item.name} was added to the live menu.`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Menu item could not be added.') }
  }

  const addMember = async (member: { outletId?: string; name: string; email: string; employeeCode: string; roleCode: 'canteen_manager' | 'outlet_manager' | 'cashier' | 'kitchen'; pin: string }) => {
    if (!selectedCanteen) return
    try {
      await createStaffMember(selectedCanteen.id, member)
      setModal(null)
      await refresh()
      notify(`${member.name} can now sign in with employee code ${member.employeeCode}.`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Staff account could not be created.') }
  }

  const toggleItem = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId)
    if (!item) return
    try {
      await setMenuItemAvailability(item.canteenId, item.id, !item.available)
      await refresh()
      notify(`${item.name} availability updated.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Availability update failed.')
    }
  }

  const toggleOutlet = async (outletId: string) => {
    const outlet = outlets.find((entry) => entry.id === outletId)
    if (!outlet) return
    try {
      await setOutletAcceptingOrders(outlet.id, !outlet.acceptingOrders)
      await refresh()
      notify(`${outlet.name} ordering state updated.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Outlet update failed.')
    }
  }

  const adjustStock = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId)
    const outlet = outlets.find((entry) => entry.canteenId === item?.canteenId)
    if (!item || !outlet) { notify('Select a menu item and make sure this canteen has an outlet.'); return }
    const entered = window.prompt(`Change ${item.name} stock at ${outlet.name}. Use a negative number to remove stock.`)
    if (entered === null) return
    const quantity = Number(entered)
    if (!Number.isFinite(quantity) || quantity === 0) { notify('Enter a non-zero stock quantity.'); return }
    const reason = window.prompt('Reason for this stock adjustment')?.trim()
    if (!reason) return
    try {
      await adjustMenuItemStock(item.canteenId, item.id, outlet.id, quantity, reason)
      await refresh()
      notify(`${item.name} stock was adjusted by ${quantity}.`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Stock adjustment failed.') }
  }

  if (!authenticated) return <ManagerDemoLogin onSignedIn={() => setAuthenticated(true)} />

  let content: ReactNode
  if (view === 'overview') content = <><SystemFlow /><ThaliTrackDashboard outletId={outlets.find((outlet) => canteenId === 'all' || outlet.canteenId === canteenId)?.id} items={scopedItems} onNotify={notify} /><Overview canteens={canteens} alerts={alerts} stats={stats} orders={scopedOrders} items={scopedItems} canteenId={canteenId} onOrder={setSelectedOrder} onNavigate={navigate} /></>
  else if (view === 'records') content = <Records canteens={canteens} orders={scopedOrders} query={query} onOrder={setSelectedOrder} />
  else if (view === 'reports') content = <Reports canteens={canteens} stats={stats} canteenId={canteenId} />
  else if (view === 'alerts') content = <Alerts canteens={canteens} alerts={alerts} canteenId={canteenId} onNotify={notify} />
  else if (view === 'menu') content = <MenuManagement items={scopedItems} query={query} onAdd={() => setModal('item')} onToggle={(id) => void toggleItem(id)} onNotify={notify} />
  else if (view === 'inventory') content = <Inventory items={scopedItems} onAdjust={(id) => void adjustStock(id)} />
  else if (view === 'outlets') content = setup ? <Outlets canteens={canteens} canteenId={canteenId} outlets={outlets} setup={setup} onToggle={(id) => void toggleOutlet(id)} onChanged={refreshSetup} onNotify={notify} /> : <Empty text="Loading outlet setup" />
  else if (view === 'kitchen') content = setup ? <KitchenSetup setup={setup} outlets={outlets.filter((outlet) => outlet.canteenId === canteenId)} onChanged={refreshSetup} onNotify={notify} /> : <Empty text="Loading kitchen setup" />
  else if (view === 'devices') content = setup ? <DevicesSetup setup={setup} outlets={outlets.filter((outlet) => outlet.canteenId === canteenId)} onChanged={refreshSetup} onNotify={notify} /> : <Empty text="Loading devices" />
  else if (view === 'team') content = <Team members={team.filter((member) => member.canteenIds.includes(canteenId))} onInvite={() => setModal('invite')} onNotify={notify} />
  else if (view === 'taxes') content = setup ? <TaxesSetup canteenId={canteenId} setup={setup} onChanged={refreshSetup} onNotify={notify} /> : <Empty text="Loading tax setup" />
  else if (view === 'modules') content = <Modules />
  else if (view === 'activity') content = <ActivityLog activities={activities} />
  else content = <SettingsPage canteen={selectedCanteen?.name ?? ''} onNotify={notify} />

  return <div className={`owner-shell mode-${mode}`}>
    <Sidebar mode={mode} view={view} open={sidebarOpen} onMain={enterMain} onAdvanced={enterAdvanced} onNavigate={navigate} onClose={() => setSidebarOpen(false)} />
    <div className="owner-main">
      <Topbar canteens={canteens} mode={mode} canteenId={canteenId} query={query} onQuery={setQuery} onContext={changeContext} onMenu={() => setSidebarOpen(true)} onNotify={notify} />
      {mode === 'advanced' && <div className="editing-banner"><LockKeyhole size={15} /><span>You are editing <strong>{selectedCanteen?.name}</strong></span><button onClick={enterMain}>Exit advanced management</button></div>}
      <main className="page-content">
        <div className="page-heading"><div><span>{copy[view].eyebrow}</span><h1>{copy[view].title}</h1><p>{copy[view].description}</p></div>{mode === 'main' && <div className="date-pill"><CalendarDays size={14} /> Today <ChevronDown size={13} /></div>}</div>
        {content}
      </main>
    </div>
    {modal === 'choose-canteen' && <CanteenChooser canteens={canteens} onChoose={chooseAdvancedCanteen} onClose={() => setModal(null)} />}
    {modal === 'item' && selectedCanteen && <ItemModal canteenId={selectedCanteen.id} onCreate={addItem} onClose={() => setModal(null)} />}
    {modal === 'invite' && selectedCanteen && <InviteModal canteenName={selectedCanteen.name} outlets={outlets.filter((outlet) => outlet.canteenId === selectedCanteen.id)} onInvite={addMember} onClose={() => setModal(null)} />}
    {selectedOrder && <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
  </div>
}

function ManagerDemoLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = async () => { setBusy(true); setError(null); try { await createDemoManagementSession(); onSignedIn() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Demo manager sign-in failed.') } finally { setBusy(false) } }
  return <div className="manager-login"><section><img src={mealyLogo} alt="Mealy" /><span>ThaliTrack canteen demo</span><h1>Run the lunch rush</h1><p>Use the seeded canteen manager to receive two-phone orders, update preparation status, log leftovers, and review tomorrow’s ML forecast.</p><button disabled={busy} onClick={() => void signIn()}>{busy ? 'Opening dashboard…' : 'Enter demo dashboard'}</button>{error && <div className="login-error"><AlertTriangle size={16} />{error}</div>}<small>Requires MEALY_DEMO_MODE=true and the sample dataset on the backend.</small></section></div>
}

function SystemFlow() {
  const steps = [
    { icon: ShoppingBag, title: 'Student app or counter POS', text: 'Students pre-order a pickup slot, while staff bill walk-in customers from the same live menu.' },
    { icon: TicketCheck, title: 'Token + KOT created', text: 'One order creates a pickup token and kitchen order ticket, giving the counter and kitchen one source of truth.' },
    { icon: CookingPot, title: 'Kitchen prepares', text: 'The KDS or printed KOT shows new orders. Staff move each ticket from new to preparing to ready.' },
    { icon: ReceiptText, title: 'Pickup without a queue', text: 'The student follows live status and collects by token during the selected 10-minute pickup window.' },
    { icon: WifiOff, title: 'Outlet survives internet loss', text: 'The local gateway keeps cash POS, KOT and KDS running with reserved tokens, then syncs after reconnection.' },
    { icon: BarChart3, title: 'Waste becomes tomorrow’s plan', text: 'Closing leftovers plus 28 days of demand update the dish forecast and after-3 PM surplus rescue.' },
  ]
  return <section className="system-story"><header><div><span>Start here · complete product story</span><h2>One order, from phone to plate</h2><p>ThaliTrack reduces lunch queues and food waste while supporting the counter, kitchen and unreliable campus internet.</p></div><strong>LIVE END-TO-END FLOW</strong></header><div className="system-flow">{steps.map(({ icon: Icon, title, text }, index) => <article key={title}><div><b>{index + 1}</b><Icon size={19} /></div><h3>{title}</h3><p>{text}</p></article>)}</div><footer><span><i className="cloud-dot" /> Cloud: student ordering, manager dashboard and forecasting</span><span><i className="local-dot" /> Outlet LAN: POS, KOT/KDS and offline gateway</span><em>Mock UPI for demo · Counter pickup only</em></footer></section>
}

function ThaliTrackDashboard({ outletId, items, onNotify }: { outletId?: string; items: MenuItem[]; onNotify: (message: string) => void }) {
  const [board, setBoard] = useState<RushBoard | null>(null)
  const [forecast, setForecast] = useState<ForecastReport | null>(null)
  const [selectedItem, setSelectedItem] = useState('')
  const [leftoverKg, setLeftoverKg] = useState('1.2')
  const refresh = useCallback(async () => {
    if (!outletId) return
    try {
      const [nextBoard, nextForecast] = await Promise.all([loadRushBoard(outletId), loadForecast(outletId)])
      setBoard(nextBoard); setForecast(nextForecast); setSelectedItem((current) => current || nextForecast.dishes[0]?.catalog_item_id || '')
    } catch (error) { onNotify(error instanceof Error ? error.message : 'ThaliTrack live data could not load.') }
  }, [onNotify, outletId])
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 3_000); return () => { window.clearTimeout(initial); window.clearInterval(timer) } }, [refresh])
  if (!outletId) return <section className="panel thali-empty">Select a canteen with an outlet to open ThaliTrack.</section>
  const move = async (orderId: string, status: string) => {
    try {
      if (status === 'placed') await transitionRushOrder(orderId, 'confirmed')
      else if (status === 'confirmed') await transitionRushOrder(orderId, 'preparing')
      else if (status === 'preparing') await transitionRushOrder(orderId, 'ready_for_pickup')
      await refresh()
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Order status could not change.') }
  }
  const logLeftover = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedItem) return
    try { await logDishLeftover(outletId, selectedItem, Number(leftoverKg)); await refresh(); onNotify('Leftover kilograms saved and tomorrow’s forecast refreshed.') }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Leftover entry failed.') }
  }
  const publishOffer = async () => {
    if (!selectedItem) return
    try { await publishSurplusOffer(outletId, selectedItem, 10); onNotify('35% surplus offer scheduled for students after 3 PM.') }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Surplus offer failed.') }
  }
  const maxForecast = Math.max(1, ...(forecast?.dishes.map((dish) => dish.recommendedQuantity) ?? [1]))
  return <section className="thalitrack-workspace"><header><div><span>Hackathon live operations</span><h2>ThaliTrack rush control</h2><p>Orders refresh every 3 seconds · forecast model {forecast?.model ?? 'loading'}</p></div><div className="saved-card"><small>Estimated food saved</small><strong>{forecast?.estimated_food_saved_kg.toFixed(2) ?? '—'} kg</strong></div></header>
    <div className="thali-grid"><section className="rush-board"><div className="thali-heading"><h3>Incoming orders by pickup slot</h3><span>{board?.orders.length ?? 0} active</span></div><div className="rush-orders">{board?.orders.length ? board.orders.map((order) => <article key={order.id}><div className="rush-token"><b>{order.token_label ?? '—'}</b><small>{order.starts_at ? new Date(order.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Walk-in'}</small></div><div><strong>{order.customer_name_snapshot}</strong><p>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</p><span>{order.status_code.replaceAll('_', ' ')}</span></div>{['placed','confirmed','preparing'].includes(order.status_code) && <button onClick={() => void move(order.id, order.status_code)}>{order.status_code === 'preparing' ? 'Mark ready' : 'Start next'}</button>}</article>) : <div className="thali-empty">Waiting for the first phone order…</div>}</div></section>
      <section className="forecast-board"><div className="thali-heading"><h3>Tomorrow’s dish forecast</h3><span>{forecast?.target_date ?? 'Loading'}</span></div><div className="forecast-chart">{forecast?.dishes.slice(0, 10).map((dish) => <div key={dish.catalog_item_id}><span>{dish.name}</span><i><b style={{ width: `${Math.max(6, dish.recommendedQuantity / maxForecast * 100)}%` }} /></i><strong>{dish.recommendedQuantity}</strong></div>)}</div></section></div>
    <form className="closing-controls" onSubmit={(event) => void logLeftover(event)}><div><span>Closing workflow</span><h3>Log leftovers and rescue surplus</h3></div><label>Dish<select value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}>{forecast?.dishes.map((dish) => <option key={dish.catalog_item_id} value={dish.catalog_item_id}>{dish.name}</option>)}{!forecast?.dishes.length && items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Leftover kg<input type="number" min="0" step="0.1" value={leftoverKg} onChange={(event) => setLeftoverKg(event.target.value)} /></label><button type="submit">Save & retrain</button><button type="button" className="surplus-action" onClick={() => void publishOffer()}>Schedule 35% offer</button></form>
  </section>
}

function Sidebar({ mode, view, open, onMain, onAdvanced, onNavigate, onClose }: { mode: AppMode; view: OwnerView; open: boolean; onMain: () => void; onAdvanced: () => void; onNavigate: (view: OwnerView) => void; onClose: () => void }) {
  return <>{open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}<aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><img src={mealyLogo} alt="Mealy" /><span>Owner workspace</span></div>
    <div className="mode-switch"><button className={mode === 'main' ? 'selected' : ''} onClick={onMain}><Gauge size={16} /> Main view</button><button className={mode === 'advanced' ? 'selected' : ''} onClick={onAdvanced}><SlidersHorizontal size={16} /> Advanced</button></div>
    <nav aria-label="Owner workspace navigation">
      {mode === 'main' ? <div className="nav-group"><p>Daily view</p>{mainNav.map(({ id, label, icon: Icon }) => <button className={view === id ? 'active' : ''} onClick={() => onNavigate(id)} key={id}><Icon size={18} /><span>{label}</span>{id === 'alerts' && <em>4</em>}</button>)}</div> : advancedGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ id, label, icon: Icon }) => <button className={view === id ? 'active' : ''} onClick={() => onNavigate(id)} key={id}><Icon size={18} /><span>{label}</span></button>)}</div>)}
    </nav>
    <div className="sidebar-help"><HelpCircle size={17} /><div><strong>{mode === 'main' ? 'Simple daily view' : 'Advanced management'}</strong><span>{mode === 'main' ? 'Stats and records only' : 'Canteen setup and controls'}</span></div></div>
    <div className="profile"><span>CA</span><div><strong>Canteen account</strong><small>Scope comes from the signed-in session</small></div><MoreHorizontal size={17} /></div>
  </aside></>
}

function Topbar({ canteens, mode, canteenId, query, onQuery, onContext, onMenu, onNotify }: { canteens: Canteen[]; mode: AppMode; canteenId: string; query: string; onQuery: (value: string) => void; onContext: (id: string) => void; onMenu: () => void; onNotify: (message: string) => void }) {
  return <header className="topbar"><button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><MenuIcon size={20} /></button><div className="context-picker"><span>Viewing</span><Building2 size={16} /><select value={canteenId} onChange={(event) => onContext(event.target.value)}><option value="all" disabled={mode === 'advanced'}>All canteens</option>{canteens.map((canteen) => <option value={canteen.id} key={canteen.id}>{canteen.name}</option>)}</select><ChevronDown size={14} /></div><label className="search"><Search size={17} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search this page" /></label><div className="top-actions"><span className="online"><i /> Connected</span><button onClick={() => onNotify('Open Alerts to review backend-reported issues.')} aria-label="Notifications"><Bell size={18} /></button></div></header>
}

function Overview({ canteens, alerts, stats, orders, items, canteenId, onOrder, onNavigate }: { canteens: Canteen[]; alerts: OwnerAlert[]; stats: ReturnType<typeof aggregatePortfolio>; orders: Order[]; items: MenuItem[]; canteenId: string; onOrder: (order: Order) => void; onNavigate: (view: OwnerView) => void }) {
  const topItems = [...items].sort((a, b) => b.stock - a.stock).slice(0, 4)
  return <div className="stack-xl">
    <section className="stats-grid"><Stat icon={<IndianRupee />} label="Order value" value={`₹${stats.orderValue.toLocaleString('en-IN')}`} note="Today across selected canteens" tone="orange" /><Stat icon={<ShoppingBag />} label="Orders today" value={stats.orders.toLocaleString('en-IN')} note={`Avg. order ₹${stats.averageOrderValue}`} tone="blue" /><Stat icon={<Clock3 />} label="Avg. preparation" value={`${stats.averagePrep} min`} note="Calculated from live orders" tone="green" /><Stat icon={<Store />} label="Active outlets" value={String(stats.activeOutlets)} note={`${stats.unavailableItems} sold out · ${stats.lowStockItems} low stock`} tone="purple" /></section>
    <div className="main-grid"><section className="panel chart-panel"><PanelHeading title="Order activity" subtitle="Hourly analytics are not available from the current API" action={<button onClick={() => onNavigate('reports')}>View reports <ArrowRight size={13} /></button>} /><Empty text="No hourly order series available" /></section>
      <section className="panel attention-panel"><PanelHeading title="Needs attention" subtitle="Simple issues to review" action={<button onClick={() => onNavigate('alerts')}>View all</button>} /><div className="attention-list">{alerts.filter((alert) => canteenId === 'all' || alert.canteenId === canteenId).slice(0, 4).map((alert) => <button onClick={() => onNavigate('alerts')} key={alert.id}><span className={alert.level} /><div><strong>{alert.title}</strong><small>{canteens.find((canteen) => canteen.id === alert.canteenId)?.name} · {alert.age}</small></div><ChevronRight size={15} /></button>)}</div></section></div>
    <section className="panel records-panel"><PanelHeading title="Recent orders" subtitle="Latest records across the selected canteens" action={<button onClick={() => onNavigate('records')}>All records <ArrowRight size={13} /></button>} /><OrderTable canteens={canteens} orders={orders.slice(0, 5)} onOrder={onOrder} /></section>
    <div className="main-grid equal"><section className="panel mini-panel"><PanelHeading title="Canteen performance" subtitle="Today so far" /><div className="canteen-list">{canteens.filter((canteen) => canteenId === 'all' || canteen.id === canteenId).map((canteen, index) => <div key={canteen.id}><span>{index + 1}</span><div><strong>{canteen.name}</strong><small>{canteen.orders} orders · {canteen.avgPrep} min prep</small></div><b>₹{canteen.orderValue.toLocaleString('en-IN')}</b></div>)}</div></section><section className="panel mini-panel"><PanelHeading title="Popular items" subtitle="Current availability snapshot" /><div className="popular-list">{topItems.map((item, index) => <div key={item.id}><span>{index + 1}</span><div><strong>{item.name}</strong><small>{item.category}</small></div><em className={item.available ? 'available' : 'sold'}>{item.available ? `${item.stock} left` : 'Sold out'}</em></div>)}</div></section></div>
  </div>
}

function Stat({ icon, label, value, note, trend, tone }: { icon: ReactNode; label: string; value: string; note: string; trend?: string; tone: string }) { return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div>{trend && <em className={trend.startsWith('-') ? 'down' : ''}>{trend.startsWith('-') ? <ArrowDownRight /> : <ArrowUpRight />}{trend}</em>}</article> }
function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div> }

function Records({ canteens, orders, query, onOrder }: { canteens: Canteen[]; orders: Order[]; query: string; onOrder: (order: Order) => void }) {
  const [status, setStatus] = useState('All')
  const filtered = orders.filter((order) => (status === 'All' || order.status === status) && `${order.id} ${order.token} ${order.customer}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel records-panel data-page"><div className="toolbar"><div className="segments">{['All','New','Preparing','Ready','Collected','Cancelled'].map((item) => <button className={status === item ? 'selected' : ''} onClick={() => setStatus(item)} key={item}>{item}</button>)}</div><button className="secondary"><Download size={15} /> Export records</button></div><OrderTable canteens={canteens} orders={filtered} onOrder={onOrder} /><div className="table-footer">Showing {filtered.length} order records <span><button disabled><ChevronLeft /></button><b>1</b><button disabled><ChevronRight /></button></span></div></section>
}

function OrderTable({ canteens, orders, onOrder }: { canteens: Canteen[]; orders: Order[]; onOrder: (order: Order) => void }) { return <div className="table-wrap"><table><thead><tr><th>Order</th><th>Canteen</th><th>Customer</th><th>Source</th><th>Value</th><th>Status</th><th>Time</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><button className="order-id" onClick={() => onOrder(order)}><strong>{order.id}</strong><small>Token {order.token}</small></button></td><td>{canteens.find((canteen) => canteen.id === order.canteenId)?.name}</td><td>{order.customer}</td><td><span className="source-chip">{order.source}</span></td><td><strong>₹{order.value}</strong></td><td><Status status={order.status} /></td><td><span className="muted">{order.time}</span></td><td><button className="row-action" onClick={() => onOrder(order)} aria-label={`View ${order.id}`}><ChevronRight /></button></td></tr>)}</tbody></table>{!orders.length && <Empty text="No matching order records" />}</div> }

function Reports({ canteens, stats, canteenId }: { canteens: Canteen[]; stats: ReturnType<typeof aggregatePortfolio>; canteenId: string }) { return <div className="stack-xl"><section className="report-hero"><div><span>Today’s order value</span><strong>₹{stats.orderValue.toLocaleString('en-IN')}</strong><small><TrendingUp size={14} /> Calculated from live orders</small></div><button className="secondary"><Download size={15} /> Download report</button></section><section className="panel report-table"><PanelHeading title="Canteen comparison" subtitle={canteenId === 'all' ? 'Performance across your portfolio' : 'Selected canteen performance'} /><table><thead><tr><th>Canteen</th><th>Orders</th><th>Order value</th><th>Avg. prep</th><th>Status</th></tr></thead><tbody>{canteens.filter((canteen) => canteenId === 'all' || canteen.id === canteenId).map((canteen) => <tr key={canteen.id}><td><strong>{canteen.name}</strong></td><td>{canteen.orders}</td><td>₹{canteen.orderValue.toLocaleString('en-IN')}</td><td>{canteen.avgPrep} min</td><td><span className={`canteen-status ${canteen.status}`}>{canteen.status}</span></td></tr>)}</tbody></table></section></div> }

function Alerts({ canteens, alerts, canteenId, onNotify }: { canteens: Canteen[]; alerts: OwnerAlert[]; canteenId: string; onNotify: (message: string) => void }) { const filtered = alerts.filter((alert) => canteenId === 'all' || alert.canteenId === canteenId); return <div className="alerts-page"><div className="alert-summary"><AlertTriangle /><div><strong>{filtered.length} items need review</strong><span>Only backend-reported alerts are shown.</span></div></div><section className="panel alert-cards">{filtered.map((alert) => <article key={alert.id}><span className={`alert-icon ${alert.level}`}>{alert.level === 'warning' ? <AlertTriangle /> : <Bell />}</span><div><div><span>{alert.level}</span><small>{alert.age} ago</small></div><h3>{alert.title}</h3><p>{alert.detail}</p><em>{canteens.find((canteen) => canteen.id === alert.canteenId)?.name}</em></div><button onClick={() => onNotify(`${alert.title} acknowledgement requires the management write API.`)}>Acknowledge</button></article>)}</section></div> }

function MenuManagement({ items, query, onAdd, onToggle, onNotify }: { items: MenuItem[]; query: string; onAdd: () => void; onToggle: (id: string) => void; onNotify: (message: string) => void }) {
  const filtered = items.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack-lg"><section className="advanced-intro"><div><ShieldCheck /><span><strong>Editing menu setup</strong><small>Changes here affect POS and student ordering visibility.</small></span></div><button onClick={() => onNotify('Menu preview needs the student ordering app, which is not implemented yet.')}><ToggleLeft size={16} /> Preview menu</button></section><section className="panel data-page"><div className="toolbar"><div className="toolbar-copy"><strong>{items.length} menu items</strong><span>{items.filter((item) => item.available).length} available · {items.filter((item) => !item.available).length} sold out</span></div><div className="toolbar-actions"><button className="secondary" onClick={() => onNotify('Menu copy requires a backend write endpoint.')}><ClipboardList size={15} /> Copy menu</button><button className="primary" onClick={onAdd}><Plus size={16} /> Add item</button></div></div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Food type</th><th>Price</th><th>Stock</th><th>Prep time</th><th>Availability</th><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><div className="item-name"><span>{item.name.slice(0,2).toUpperCase()}</span><strong>{item.name}</strong></div></td><td>{item.category}</td><td>{item.foodType}</td><td><strong>₹{item.price}</strong></td><td className={item.stock <= 12 ? 'low-stock' : ''}>{item.stock} portions</td><td>{item.prepMinutes} min</td><td><button className={`availability ${item.available ? 'on' : ''}`} onClick={() => onToggle(item.id)}><i />{item.available ? 'Available' : 'Sold out'}</button></td><td><button className="row-action"><MoreHorizontal /></button></td></tr>)}</tbody></table></div></section></div>
}

function Inventory({ items, onAdjust }: { items: MenuItem[]; onAdjust: (id: string) => void }) { return <div className="stack-lg"><div className="inventory-stats"><MiniStat label="Tracked items" value={String(items.length)} icon={<Boxes />} /><MiniStat label="Low stock" value={String(items.filter((item) => item.stock > 0 && item.stock <= 12).length)} icon={<AlertTriangle />} /><MiniStat label="Out of stock" value={String(items.filter((item) => item.stock === 0).length)} icon={<PackageOpen />} /></div><section className="panel data-page"><div className="toolbar"><div className="toolbar-copy"><strong>Stock by menu item</strong><span>Adjustments create an outlet stock ledger entry and audit record.</span></div></div>{items.length === 0 ? <Empty text="No inventory records returned" /> : <div className="inventory-list">{items.map((item) => <div key={item.id}><span className={`stock-mark ${item.stock === 0 ? 'empty' : item.stock <= 12 ? 'low' : ''}`}><Boxes /></span><div><strong>{item.name}</strong><small>{item.category}</small></div><div className="stock-bar"><span><i style={{ width: `${Math.min(100,item.stock*2)}%` }} /></span><b>{item.stock} portions</b></div><button className="secondary" onClick={() => onAdjust(item.id)}>Adjust stock</button></div>)}</div>}</section></div> }
function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div> }

function Outlets({ canteens, canteenId, outlets, setup, onToggle, onChanged, onNotify }: { canteens: Canteen[]; canteenId: string; outlets: Outlet[]; setup: ManagementSetup; onToggle: (id: string) => void; onChanged: () => Promise<void>; onNotify: (message: string) => void }) { const scoped = outlets.filter((outlet) => outlet.canteenId === canteenId); return <div className="outlet-grid">{scoped.map((outlet) => <article className="panel outlet-card" key={outlet.id}><header><span><Store /></span><div><h2>{outlet.name}</h2><p>{canteens.find((canteen) => canteen.id === outlet.canteenId)?.name}</p></div><button aria-label={`More options for ${outlet.name}`}><MoreHorizontal /></button></header><div className="outlet-state"><span className={outlet.acceptingOrders ? 'open' : 'paused'}><i />{outlet.acceptingOrders ? 'Accepting orders' : 'Orders paused'}</span><button onClick={() => onToggle(outlet.id)}>{outlet.acceptingOrders ? 'Pause' : 'Resume'}</button></div><dl><div><dt>Business hours</dt><dd><Clock3 />{hoursSummary(setup, outlet.id)}</dd></div><div><dt>Service counters</dt><dd><TicketCheck />{outlet.counters} counters</dd></div><div><dt>POS terminals</dt><dd><MonitorCog />{setup.terminals.filter((terminal) => terminal.outletId === outlet.id && terminal.status !== 'retired').length} registered</dd></div></dl><footer><HoursEditor outlet={outlet} setup={setup} outlets={scoped} onChanged={onChanged} onNotify={onNotify} /></footer></article>)}<button className="add-card" onClick={() => onNotify('New outlet creation remains a Mealy platform-admin action.')}><Plus /><strong>Request another outlet</strong><span>Send a request to Mealy</span></button></div> }

function Team({ members, onInvite, onNotify }: { members: TeamMember[]; onInvite: () => void; onNotify: (message: string) => void }) { return <section className="panel data-page"><div className="toolbar"><div className="toolbar-copy"><strong>{members.length} people have access</strong><span>Roles and access are limited to this canteen.</span></div><button className="primary" onClick={onInvite}><UserPlus /> Invite staff</button></div><table><thead><tr><th>Team member</th><th>Role</th><th>Scope</th><th>Status</th><th>Last active</th><th /></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="member"><span>{member.initials}</span><strong>{member.name}</strong></div></td><td><span className="role-chip">{member.role}</span></td><td>{member.scope}</td><td><Status status={member.status} /></td><td>{member.lastSeen}</td><td><button className="row-action" onClick={() => onNotify(`Access controls opened for ${member.name}.`)}><MoreHorizontal /></button></td></tr>)}</tbody></table><div className="owner-guard"><ShieldCheck /><span><strong>Owner protection is active</strong>The final active owner cannot remove their own access.</span></div></section> }

function Modules() { return <div><div className="module-note"><LockKeyhole /><div><strong>Modules are assigned by Mealy</strong><span>Entitlement data is not exposed by the current canteen management endpoint.</span></div></div><section className="panel"><Empty text="No canteen entitlements returned" /></section></div> }

function ActivityLog({ activities }: { activities: OwnerActivity[] }) { return <section className="panel activity-page"><div className="toolbar"><div className="toolbar-copy"><strong>Recent changes</strong><span>Price, availability and configuration activity</span></div><button className="secondary"><Download /> Export log</button></div>{activities.map((entry) => <div className="activity-entry" key={entry.id}><span><History /></span><div><strong>{entry.action}</strong><small>{entry.target}</small></div><p>{entry.actor}</p><time>{entry.time}</time><button className="row-action"><ChevronRight /></button></div>)}</section> }

function SettingsPage({ canteen, onNotify }: { canteen: string; onNotify: (message: string) => void }) { return <section className="panel settings-panel"><div className="settings-title"><span><Building2 /></span><div><h2>{canteen || 'Canteen'} settings</h2><p>Settings endpoints are not available yet, so no placeholder values are displayed or saved.</p></div></div><Empty text="No settings returned" /><button className="primary" onClick={() => onNotify('Canteen settings require a backend endpoint.')} disabled>Save changes</button></section> }

function Status({ status }: { status: string }) { return <span className={`status status-${status.toLowerCase().replace(' ','-')}`}><i />{status}</span> }
function Empty({ text }: { text: string }) { return <div className="empty"><Search /><strong>{text}</strong><span>Try another search or filter.</span></div> }

function ModalFrame({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: ReactNode; onClose: () => void }) { return <div className="modal-layer"><button className="backdrop" onClick={onClose} aria-label="Close dialog" /><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose}><X /></button></header>{children}</section></div> }
function CanteenChooser({ canteens, onChoose, onClose }: { canteens: Canteen[]; onChoose: (id: string) => void; onClose: () => void }) { return <ModalFrame title="Choose a canteen to manage" subtitle="Advanced changes must always apply to one clearly selected canteen." onClose={onClose}><div className="canteen-options">{canteens.map((canteen) => <button key={canteen.id} onClick={() => onChoose(canteen.id)}><span><Store /></span><div><strong>{canteen.name}</strong><small>{canteen.campus} · {canteen.outlets} outlets</small></div><ChevronRight /></button>)}</div><div className="modal-info"><ShieldCheck /> You will see a persistent editing banner while Advanced management is open.</div></ModalFrame> }
function ItemModal({ canteenId, onCreate, onClose }: { canteenId: string; onCreate: (item: MenuItem) => void | Promise<void>; onClose: () => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onCreate({ id: `item-${Date.now()}`, canteenId, name: String(data.get('name')), category: String(data.get('category')), price: Number(data.get('price')), foodType: String(data.get('foodType')) as MenuItem['foodType'], available: true, stock: Number(data.get('stock')), prepMinutes: Number(data.get('prep')) }) }; return <ModalFrame title="Add menu item" subtitle="Create an item for the selected canteen." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Item name<input name="name" required placeholder="e.g. Paneer Tikka Roll" /></label><div className="form-row"><label>Category<input name="category" required placeholder="Rolls" /></label><label>Food type<select name="foodType"><option>Veg</option><option>Non-veg</option><option>Vegan</option><option>Egg</option></select></label></div><div className="form-row"><label>Price (₹)<input name="price" type="number" min="0" required defaultValue="100" /></label><label>Starting stock<input name="stock" type="number" min="0" required defaultValue="20" /></label></div><label>Preparation time (minutes)<input name="prep" type="number" min="0" required defaultValue="10" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Add menu item</button></div></form></ModalFrame> }
function InviteModal({ canteenName, outlets, onInvite, onClose }: { canteenName: string; outlets: Outlet[]; onInvite: (member: { outletId?: string; name: string; email: string; employeeCode: string; roleCode: 'canteen_manager' | 'outlet_manager' | 'cashier' | 'kitchen'; pin: string }) => void | Promise<void>; onClose: () => void }) { const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const roleCode = String(data.get('role')) as 'canteen_manager' | 'outlet_manager' | 'cashier' | 'kitchen'; void onInvite({ name: String(data.get('name')), email: String(data.get('email')), employeeCode: String(data.get('employeeCode')).toUpperCase(), pin: String(data.get('pin')), roleCode, ...(roleCode === 'canteen_manager' ? {} : { outletId: String(data.get('outletId')) }) }) }; return <ModalFrame title="Create staff access" subtitle={`Grant operational access to ${canteenName}.`} onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Full name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><div className="form-row"><label>Employee code<input name="employeeCode" required placeholder="CB-CASHIER-02" /></label><label>PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" required /></label></div><label>Role<select name="role"><option value="cashier">Cashier</option><option value="kitchen">Kitchen staff</option><option value="outlet_manager">Outlet manager</option><option value="canteen_manager">Canteen manager</option></select></label><label>Outlet<select name="outletId" required>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label><div className="modal-info"><ShieldCheck /> Access is limited to the selected canteen or outlet and can be suspended later.</div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Create staff access</button></div></form></ModalFrame> }

function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) { return <div className="drawer-layer"><button className="backdrop" onClick={onClose} aria-label="Close order details" /><aside className="drawer"><header><div><span>Order record</span><h2>{order.id}</h2></div><button onClick={onClose}><X /></button></header><div className="drawer-body"><div className="token-box"><small>Token</small><strong>{order.token}</strong><Status status={order.status} /></div><section><h3>Customer</h3><p>{order.customer}</p><span>{order.source} · {order.time}</span></section><section><h3>Order summary</h3><div className="summary-row"><span>{order.items} items</span><strong>₹{order.value}</strong></div><div className="summary-row"><span>Taxes and charges included</span><strong>Recorded</strong></div></section><section><h3>Status timeline</h3><div className="timeline"><span className="done"><i><Check /></i>Order placed <small>2:14 PM</small></span><span className="done"><i><Check /></i>Confirmed <small>2:15 PM</small></span><span className={order.status === 'Preparing' ? 'current' : 'done'}><i>{order.status === 'Preparing' ? <Clock3 /> : <Check />}</i>Preparing <small>2:17 PM</small></span><span><i />Ready for pickup</span></div></section><div className="readonly-note"><LockKeyhole /> This is a record view. Kitchen actions remain in POS and KDS.</div></div><footer><button className="secondary"><Download /> Download receipt</button></footer></aside></div> }
