import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Bell, BellRing, CheckCircle2, ChevronRight, Clock3, CreditCard, HelpCircle, Home, Info, LoaderCircle, MapPin, Minus, PackageOpen, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, SlidersHorizontal, UserRound, UtensilsCrossed, X } from 'lucide-react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import mealyLogo from '../../pos/src/assets/mealy-logo.png'
import { configuredOutletId, createDemoSession, createStudentOrder, getCatalog, getDiscovery, getOrder, getOrders, getPickupSlots, getQueueStatus, getQuote, getSurplusOffers, readSession, requestOtp, saveSession, verifyOtp } from './api'
import { useCart } from './cart'
import type { CatalogItem, DiscoveryCampus, OutletCatalog, PickupSlot, QueueStatus, Quote, StudentOrder, SurplusOffer } from './types'

type CatalogState = { catalog: OutletCatalog | null; loading: boolean; error: string | null; reload: () => void }
const CatalogContext = createContext<CatalogState | undefined>(undefined)
type Notice = { id: number; title: string; detail?: string; tone?: 'success' | 'ready' }
const NoticeContext = createContext<{ notify: (notice: Omit<Notice, 'id'>) => void } | undefined>(undefined)

function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const nextId = useRef(0)
  const notify = useCallback((notice: Omit<Notice, 'id'>) => {
    const id = ++nextId.current
    setNotices((current) => [...current.slice(-2), { ...notice, id }])
    window.setTimeout(() => setNotices((current) => current.filter((entry) => entry.id !== id)), notice.tone === 'ready' ? 6500 : 2800)
  }, [])
  return <NoticeContext.Provider value={{ notify }}>{children}<div className="notice-stack" aria-live="polite">{notices.map((notice) => <motion.div key={notice.id} className={`app-notice ${notice.tone ?? ''}`} initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}><span>{notice.tone === 'ready' ? <BellRing size={19} /> : <CheckCircle2 size={19} />}</span><div><b>{notice.title}</b>{notice.detail && <small>{notice.detail}</small>}</div><button onClick={() => setNotices((current) => current.filter((entry) => entry.id !== notice.id))} aria-label="Dismiss notification"><X size={15} /></button></motion.div>)}</div></NoticeContext.Provider>
}

function useNotice() {
  const context = useContext(NoticeContext)
  if (!context) throw new Error('useNotice must be used inside NoticeProvider')
  return context
}

function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<OutletCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const selectedOutletId = configuredOutletId()
  useEffect(() => {
    if (!selectedOutletId) { setCatalog(null); setError(null); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getCatalog(selectedOutletId, controller.signal).then(setCatalog).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The live catalogue could not load.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt, selectedOutletId])
  const value = useMemo(() => ({ catalog, loading, error, reload: () => setAttempt((value) => value + 1) }), [catalog, loading, error])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

function useCatalog(): CatalogState {
  const context = useContext(CatalogContext)
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider')
  return context
}

function money(minor: number | string, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(minor) / 100)
}

function titleCase(value: string | null | undefined): string {
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Menu item'
}

export default function App() {
  return <NoticeProvider><CatalogProvider><StudentRoutes /></CatalogProvider></NoticeProvider>
}

function StudentRoutes() {
  const location = useLocation()
  const reducedMotion = useReducedMotion()
  return <LayoutGroup><AnimatePresence mode="wait" initial={false}>
    <motion.div key={location.pathname} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      <Routes location={location}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/auth" element={<StudentAuthPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </motion.div>
  </AnimatePresence></LayoutGroup>
}

function AppShell() {
  const { catalog, loading, error, reload } = useCatalog()
  const { count } = useCart()
  if (loading) return <Splash />
  if (error) return <SystemState title="Live student data is not ready" detail={error} action="Try again" onAction={reload} />
  if (!catalog) return <DiscoveryLanding />
  return <div className="student-shell">
    <OrderStatusWatcher />
    <Header catalog={catalog} cartCount={count} />
    <aside className="desktop-nav"><Brand /><Navigation /><div className="rail-note"><Info size={16} /><span>Prices and availability refresh from Mealy.</span></div></aside>
    <main className="student-main"><Routes>
      <Route path="/" element={<HomePage catalog={catalog} />} />
      <Route path="/search" element={<BrowsePage catalog={catalog} searchMode />} />
      <Route path="/canteens/:canteenId" element={<CanteenPage catalog={catalog} />} />
      <Route path="/canteens/:canteenId/items/:itemId" element={<ItemPage catalog={catalog} />} />
      <Route path="/cart" element={<CartPage catalog={catalog} />} />
      <Route path="/checkout" element={<StudentCheckoutPage catalog={catalog} />} />
      <Route path="/orders" element={<StudentOrdersPage />} />
      <Route path="/orders/:orderId" element={<StudentOrderDetailPage />} />
      <Route path="/profile" element={<ProfilePage catalog={catalog} />} />
      <Route path="/campus" element={<CampusPage catalog={catalog} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></main>
    <CartRail catalog={catalog} />
    <MobileNavigation cartCount={count} />
  </div>
}

function OrderStatusWatcher() {
  const { notify } = useNotice()
  const knownStatuses = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    if (!readSession()) return
    let active = true
    const refresh = async () => {
      try {
        const orders = await getOrders()
        if (!active) return
        const firstLoad = knownStatuses.current.size === 0
        for (const order of orders) {
          const previous = knownStatuses.current.get(order.id)
          if (!firstLoad && previous && previous !== order.status_code) {
            const ready = order.status_code === 'ready_for_pickup'
            notify({ title: ready ? `Token ${order.token_label ?? ''} is ready!` : `Order ${titleCase(order.status_code)}`, detail: ready ? 'Collect it from the counter now.' : `${order.public_number} moved from ${titleCase(previous)} to ${titleCase(order.status_code)}.`, tone: ready ? 'ready' : 'success' })
          }
          knownStatuses.current.set(order.id, order.status_code)
        }
      } catch { /* The orders screen presents API errors; this watcher stays unobtrusive. */ }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [notify])
  return null
}

function Brand() { return <Link className="brand" to="/" aria-label="Mealy home"><img src={mealyLogo} alt="Mealy" /></Link> }

function Header({ catalog, cartCount }: { catalog: OutletCatalog; cartCount: number }) {
  return <header className="mobile-header"><Brand /><Link className="context-button" to="/campus"><MapPin size={16} /><span>{catalog.outlet.name}</span><ChevronRight size={15} /></Link><Link className="header-cart" to="/cart" aria-label={`Cart with ${cartCount} items`}><ShoppingBag size={19} />{cartCount > 0 && <b>{cartCount}</b>}</Link></header>
}

const nav = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

function Navigation() { return <nav className="navigation" aria-label="Student navigation">{nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon size={19} /><span>{label}</span></NavLink>)}</nav> }

function MobileNavigation({ cartCount }: { cartCount: number }) { return <nav className="mobile-nav" aria-label="Student navigation">{nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'mobile-nav-link active' : 'mobile-nav-link'}>{({ isActive }) => <><span className="nav-icon"><Icon size={20} />{isActive && <motion.i layoutId="mobile-nav-active" transition={{ type: 'spring', stiffness: 420, damping: 30 }} />}</span><span>{label}</span>{to === '/orders' && cartCount > 0 && <em>{cartCount}</em>}</>}</NavLink>)}</nav> }

function Splash() { return <div className="splash"><motion.img initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} src={mealyLogo} alt="Mealy" /><div className="splash-loader" /><span>Preparing your campus menu</span></div> }

function SystemState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <div className="system-state"><Brand /><div className="system-card"><div className="system-icon"><PackageOpen /></div><h1>{title}</h1><p>{detail}</p>{action && <button className="primary-action" onClick={onAction}><RefreshCw size={17} />{action}</button>}<small>Mealy does not display substitute menu or order data.</small></div></div> }

function DiscoveryLanding() {
  const [campuses, setCampuses] = useState<DiscoveryCampus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = (position?: GeolocationPosition) => { setLoading(true); setError(null); void getDiscovery(position?.coords.latitude, position?.coords.longitude).then(setCampuses).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Nearby canteens could not load.')).finally(() => setLoading(false)) }
  useEffect(() => { load(); }, [])
  const useLocation = () => { if (!navigator.geolocation) { setError('Location is not available in this browser. You can still choose a campus below.'); return } navigator.geolocation.getCurrentPosition(load, () => setError('Location permission was not granted. You can still choose a campus below.'), { enableHighAccuracy: false, timeout: 8000 }) }
  return <div className="student-shell"><main className="student-main"><div className="page-frame"><header className="page-heading"><div><span className="eyebrow">Campus food ordering</span><h1>Choose a canteen near you</h1></div><button className="secondary-action" onClick={useLocation}><MapPin size={16} />Use my location</button></header>{loading ? <Splash /> : error ? <EmptyPanel text={error} action={<button className="primary-action" onClick={() => load()}>Try again</button>} /> : <div className="profile-grid">{campuses.flatMap((campus) => campus.outlets.map((outlet) => <Link className="profile-card" key={outlet.id} to={`/?outlet=${outlet.id}`}><div className="profile-avatar"><UtensilsCrossed size={22} /></div><div><span className="eyebrow">{campus.name}{campus.distance_km !== null ? ` · ${Number(campus.distance_km).toFixed(1)} km` : ''}</span><h2>{outlet.canteen_name}</h2><p>{outlet.name} · {outlet.accepts_orders ? `${outlet.preparation_lead_minutes} min pickup` : 'Not accepting orders'}</p></div><ChevronRight size={18} /></Link>))}</div>}</div></main></div>
}

function HomePage({ catalog }: { catalog: OutletCatalog }) {
  const available = catalog.items.filter((item) => item.is_available)
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [offers, setOffers] = useState<SurplusOffer[]>([])
  useEffect(() => {
    const refresh = () => { void getQueueStatus().then(setQueue).catch(() => undefined); void getSurplusOffers().then(setOffers).catch(() => undefined) }
    refresh()
    const timer = window.setInterval(refresh, 5_000)
    return () => window.clearInterval(timer)
  }, [])
  return <PageFrame title="Good food, right where you are" eyebrow={catalog.outlet.canteen_name} action={<Link className="text-action" to={`/canteens/${catalog.outlet.canteen_id}`}>View menu <ArrowRight size={16} /></Link>}>
    <section className="home-hero"><div><span className="eyebrow"><MapPin size={14} />{catalog.outlet.name}</span><h1>What are you in the mood for?</h1><p>{catalog.outlet.accepts_orders ? `Pickup orders are open. Usually ready in about ${catalog.outlet.preparation_lead_minutes} min.` : 'This outlet is not accepting orders right now.'}</p><Link className="hero-search" to="/search"><Search size={19} /><span>Search today’s menu</span><kbd>/</kbd></Link></div><div className="hero-mark"><UtensilsCrossed size={30} /><span>Campus<br />pickup</span></div></section>
    {queue && <section className="queue-glance"><div><Clock3 size={20} /><span><b>{queue.estimated_wait_minutes} min</b><small>estimated wait</small></span></div><div><ShoppingBag size={20} /><span><b>{queue.active_orders}</b><small>orders cooking</small></span></div><div><PackageOpen size={20} /><span><b>{queue.ready_orders}</b><small>ready now</small></span></div></section>}
    <section className="student-journey" aria-label="How campus pickup works"><article><b>1</b><div><strong>Choose food</strong><span>Pick dishes and a 10-minute slot</span></div></article><article><b>2</b><div><strong>Kitchen prepares</strong><span>Your token and live status update here</span></div></article><article><b>3</b><div><strong>Collect, no queue</strong><span>Show the token at the counter</span></div></article></section>
    {offers.length > 0 && <section className="surplus-banner"><Bell size={20} /><div><strong>After-3 PM surplus rescue</strong><span>{offers[0]!.name} is {offers[0]!.discount_percent}% off · {offers[0]!.quantity_available} portions available</span></div></section>}
    {queue?.rush_windows?.length ? <section className="rush-strip"><Clock3 size={18} /><span><b>Timetable rush prediction:</b> {queue.rush_windows.map((window) => `${String(window.lecture_ends_at).slice(0, 5)} ${window.label}`).join(' · ')}</span></section> : null}
    <section className="section-block"><SectionTitle title="Browse by category" subtitle="Live categories from this canteen" /><div className="category-row">{catalog.categories.length ? catalog.categories.map((category) => <Link className="category-chip" key={category.id} to={`/canteens/${catalog.outlet.canteen_id}?category=${category.id}`}><span>{category.name.slice(0, 1).toUpperCase()}</span>{category.name}</Link>) : <EmptyInline text="No categories are available yet." />}</div></section>
    <section className="section-block"><SectionTitle title="Available now" subtitle={`${available.length} live menu item${available.length === 1 ? '' : 's'}`} /><ItemGrid catalog={catalog} items={available.slice(0, 8)} /></section>
  </PageFrame>
}

function CanteenPage({ catalog }: { catalog: OutletCatalog }) {
  const { canteenId } = useParams()
  if (canteenId !== catalog.outlet.canteen_id) return <SystemState title="Canteen not available" detail="The selected canteen is not in the current live context." />
  return <BrowsePage catalog={catalog} />
}

function BrowsePage({ catalog, searchMode = false }: { catalog: OutletCatalog; searchMode?: boolean }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const items = catalog.items.filter((item) => (categoryId === 'all' || item.primary_category_id === categoryId) && `${item.name} ${item.short_description ?? ''} ${item.food_type ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  return <PageFrame title={searchMode ? 'Search the menu' : catalog.outlet.canteen_name} eyebrow={searchMode ? 'Find something you like' : `${catalog.outlet.name} · ${catalog.outlet.accepts_orders ? 'Accepting orders' : 'Unavailable'}`} back={!searchMode ? () => navigate('/') : undefined}>
    <div className="browse-layout"><section className="menu-content"><label className="search-field"><Search size={19} /><input autoFocus={searchMode} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search food, drinks, and more" aria-label="Search menu" /><SlidersHorizontal size={18} /></label><div className="category-tabs"><button className={categoryId === 'all' ? 'selected' : ''} onClick={() => setCategoryId('all')}>All</button>{catalog.categories.map((category) => <button className={categoryId === category.id ? 'selected' : ''} key={category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div><div className="menu-meta"><span>{items.length} item{items.length === 1 ? '' : 's'} shown</span><span>{catalog.outlet.preparation_lead_minutes} min prep time</span></div><ItemGrid catalog={catalog} items={items} emptyText={query ? 'No live menu item matches your search.' : 'No menu items are available in this category.'} /></section><CartRail catalog={catalog} inline /></div>
  </PageFrame>
}

function ItemGrid({ catalog, items, emptyText = 'No live menu items are available.' }: { catalog: OutletCatalog; items: CatalogItem[]; emptyText?: string }) { return items.length ? <div className="item-grid">{items.map((item) => <ItemCard key={item.id} catalog={catalog} item={item} />)}</div> : <EmptyPanel text={emptyText} /> }

function ItemCard({ catalog, item }: { catalog: OutletCatalog; item: CatalogItem }) {
  const { add } = useCart()
  const { notify } = useNotice()
  const itemPath = `/canteens/${catalog.outlet.canteen_id}/items/${item.id}`
  const defaultVariant = item.variants.find((variant) => variant.is_default && variant.is_available)
  return <motion.article layoutId={`item:${item.id}:card`} className={`item-card ${item.is_available ? '' : 'unavailable'}`}><Link to={itemPath} className="item-card-link"><FoodVisual item={item} /><div className="item-copy"><div><span className="food-tag">{titleCase(item.food_type)}</span><h3>{item.name}</h3><p>{item.short_description || 'Details are not available for this item yet.'}</p></div><strong>{money(defaultVariant?.price_minor ?? item.price_minor, item.currency_code)}</strong></div></Link><button className="add-button" disabled={!item.is_available} onClick={() => { add(item, defaultVariant?.id); notify({ title: 'Added to cart', detail: `${item.name} is in your order.`, tone: 'success' }) }} aria-label={`Add ${item.name} to cart`}>{item.is_available ? <Plus size={18} /> : <X size={17} />}</button></motion.article>
}

function FoodVisual({ item, compact = false }: { item: CatalogItem; compact?: boolean }) { return <motion.div layoutId={`item:${item.id}:image`} className={`food-visual ${compact ? 'compact' : ''}`}>{item.image_url ? <img src={item.image_url} alt="" /> : <span aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span>}{!item.is_available && <b>Sold out</b>}</motion.div> }

function ItemPage({ catalog }: { catalog: OutletCatalog }) {
  const navigate = useNavigate()
  const { itemId } = useParams()
  const item = catalog.items.find((entry) => entry.id === itemId)
  const { add } = useCart()
  const { notify } = useNotice()
  const [variantId, setVariantId] = useState<string | undefined>(item?.variants.find((variant) => variant.is_default && variant.is_available)?.id)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  if (!item) return <SystemState title="Item unavailable" detail="This menu item is not available in the current live catalogue." />
  const selectedVariant = item.variants.find((variant) => variant.id === variantId)
  const unitPrice = Number(selectedVariant?.price_minor ?? item.price_minor)
  return <PageFrame title="Item details" back={() => navigate(-1)}><section className="item-detail"><motion.div layoutId={`item:${item.id}:card`} className="item-detail-card"><FoodVisual item={item} /><div className="detail-heading"><span className="food-tag">{titleCase(item.food_type)}</span><h1><motion.span layoutId={`item:${item.id}:name`}>{item.name}</motion.span></h1><p>{item.short_description || 'This canteen has not added an item description yet.'}</p><strong><motion.span layoutId={`item:${item.id}:price`}>{money(unitPrice, item.currency_code)}</motion.span></strong></div></motion.div><div className="detail-options">{item.variants.length > 0 && <fieldset><legend>Choose a size</legend>{item.variants.map((variant) => <label className={!variant.is_available ? 'option disabled' : 'option'} key={variant.id}><input type="radio" name="variant" disabled={!variant.is_available} checked={variantId === variant.id} onChange={() => setVariantId(variant.id)} /><span>{variant.name}</span><b>{money(variant.price_minor, item.currency_code)}</b></label>)}</fieldset>}<label className="note-field"><span>Add a kitchen note</span><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 160))} placeholder="Only if the canteen should know something" /></label></div><footer className="detail-footer"><div className="quantity-stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Reduce quantity"><Minus size={17} /></button><b>{quantity}</b><button onClick={() => setQuantity((value) => value + 1)} aria-label="Increase quantity"><Plus size={17} /></button></div><button className="primary-action" disabled={!item.is_available} onClick={() => { for (let index = 0; index < quantity; index += 1) add(item, variantId, note); notify({ title: 'Added to cart', detail: `${quantity} × ${item.name}`, tone: 'success' }); navigate('/cart') }}><ShoppingBag size={18} />{item.is_available ? `Add · ${money(unitPrice * quantity, item.currency_code)}` : 'Sold out'}</button></footer></section></PageFrame>
}

function CartRail({ catalog, inline = false }: { catalog: OutletCatalog; inline?: boolean }) {
  const { lines, count } = useCart()
  const total = lines.reduce((sum, line) => sum + Number(line.item.variants.find((variant) => variant.id === line.variantId)?.price_minor ?? line.item.price_minor) * line.quantity, 0)
  return <aside className={`${inline ? 'inline-cart' : 'desktop-cart'} cart-rail`}><div className="cart-rail-head"><div><span>Your order</span><h2>{count ? `${count} item${count === 1 ? '' : 's'} in cart` : 'Nothing added yet'}</h2></div><ShoppingBag size={21} /></div>{lines.length ? <><div className="cart-lines">{lines.map((line) => <div key={`${line.item.id}:${line.variantId ?? ''}`}><span>{line.quantity}×</span><p>{line.item.name}<small>{line.variantId ? line.item.variants.find((variant) => variant.id === line.variantId)?.name : ''}</small></p><b>{money(Number(line.item.variants.find((variant) => variant.id === line.variantId)?.price_minor ?? line.item.price_minor) * line.quantity, catalog.outlet.currency_code)}</b></div>)}</div><div className="cart-total"><span>Estimated total</span><strong>{money(total, catalog.outlet.currency_code)}</strong></div><Link className="primary-action full" to="/cart"><ShoppingBag size={18} />Review cart</Link></> : <p className="cart-empty">Choose an available menu item to start an order.</p>}</aside>
}

function CartPage({ catalog }: { catalog: OutletCatalog }) {
  const navigate = useNavigate()
  const { lines, update, remove, count } = useCart()
  const total = lines.reduce((sum, line) => sum + Number(line.item.variants.find((variant) => variant.id === line.variantId)?.price_minor ?? line.item.price_minor) * line.quantity, 0)
  return <PageFrame title="Your cart" eyebrow={`${count} item${count === 1 ? '' : 's'} selected`} back={() => navigate(-1)}>{lines.length ? <section className="cart-page"><div className="cart-page-lines">{lines.map((line) => <article key={`${line.item.id}:${line.variantId ?? ''}:${line.note ?? ''}`}><FoodVisual item={line.item} compact /><div><h2>{line.item.name}</h2><p>{line.variantId ? line.item.variants.find((variant) => variant.id === line.variantId)?.name : 'Standard item'}{line.note ? ` - ${line.note}` : ''}</p><button className="remove-link" onClick={() => remove(line.item.id, line.variantId, line.note)}>Remove</button></div><div className="line-controls"><b>{money(Number(line.item.variants.find((variant) => variant.id === line.variantId)?.price_minor ?? line.item.price_minor) * line.quantity, catalog.outlet.currency_code)}</b><div className="quantity-stepper"><button onClick={() => update(line.item.id, line.variantId, line.note, line.quantity - 1)}><Minus size={15} /></button><span>{line.quantity}</span><button onClick={() => update(line.item.id, line.variantId, line.note, line.quantity + 1)}><Plus size={15} /></button></div></div></article>)}</div><aside className="cart-summary"><span>Pickup from</span><h2>{catalog.outlet.name}</h2><p>{catalog.outlet.canteen_name}</p><dl><div><dt>Subtotal</dt><dd>{money(total, catalog.outlet.currency_code)}</dd></div><div><dt>Taxes and charges</dt><dd>Calculated at checkout</dd></div><div className="grand-total"><dt>Estimated total</dt><dd>{money(total, catalog.outlet.currency_code)}</dd></div></dl><Link className="primary-action full" to="/checkout">Continue to checkout <ArrowRight size={18} /></Link></aside></section> : <EmptyPanel text="Your cart is empty. Add a live menu item to continue." action={<Link className="primary-action" to={`/canteens/${catalog.outlet.canteen_id}`}>Browse menu</Link>} />}</PageFrame>
}

function StudentCheckoutPage({ catalog }: { catalog: OutletCatalog }) {
  const navigate = useNavigate()
  const { lines, count, clear } = useCart()
  const [slots, setSlots] = useState<PickupSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placedOrder, setPlacedOrder] = useState<StudentOrder | null>(null)
  const session = readSession()
  const [checkoutStartedAt] = useState(() => Date.now())
  const signedIn = Boolean(session && Date.parse(session.expires_at) > checkoutStartedAt)
  useEffect(() => {
    if (!lines.length) return
    void Promise.all([getQuote(lines), getPickupSlots()]).then(([nextQuote, nextSlots]) => {
      setQuote(nextQuote); setSlots(nextSlots); setSelectedSlot(nextSlots.find((slot) => slot.remaining_capacity > 0)?.id ?? '')
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Checkout could not load.'))
  }, [lines])
  if (!lines.length && !placedOrder) return <Navigate to="/cart" replace />
  const placeOrder = async () => {
    if (!catalog.outlet.counter_id || !selectedSlot) return
    setBusy(true); setError(null)
    try {
      const order = await createStudentOrder(lines, selectedSlot, catalog.outlet.counter_id)
      clear(); setPlacedOrder(order)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The order could not be placed.') }
    finally { setBusy(false) }
  }
  return <PageFrame title="Choose your pickup" eyebrow="Order in under 30 seconds" back={() => navigate(-1)}><section className="checkout-layout"><div className="checkout-main">
    <section className="checkout-section"><span className="step-label">1</span><div><h2>10-minute pickup slot</h2><p>Capacity is reserved atomically when you place the order.</p><div className="slot-grid">{slots.map((slot) => <button key={slot.id} disabled={slot.remaining_capacity < 1} className={selectedSlot === slot.id ? 'selected' : ''} onClick={() => setSelectedSlot(slot.id)}><b>{new Date(slot.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><small>{slot.remaining_capacity} spots left</small></button>)}</div></div></section>
    <section className="checkout-section"><span className="step-label">2</span><div><h2>{signedIn ? 'Student verified' : 'Choose a student account'}</h2><p>{signedIn ? `Signed in as ${session?.user.display_name ?? session?.user.displayName ?? 'student'}.` : 'Select an available student profile to continue.'}</p>{!signedIn && <Link className="secondary-action" to="/auth">Sign in <ArrowRight size={16} /></Link>}</div></section>
    <section className="checkout-section"><span className="step-label">3</span><div><h2>UPI payment simulation</h2><p>This local environment simulates a successful UPI payment. No money moves.</p><div className="payment-method-card"><CreditCard size={20} /><span><b>UPI payment simulation</b><small>Production payments require provider verification.</small></span><span className="payment-status">Simulation</span></div></div></section>
  </div><aside className="checkout-summary"><h2>Order summary</h2><p>{count} item{count === 1 ? '' : 's'} · {catalog.outlet.name}</p>{quote && <dl><div><dt>Subtotal</dt><dd>{money(quote.subtotal_minor, quote.currency_code)}</dd></div><div><dt>Tax and charges</dt><dd>{money(quote.tax_total_minor + quote.charge_total_minor, quote.currency_code)}</dd></div><div className="grand-total"><dt>Total</dt><dd>{money(quote.total_minor, quote.currency_code)}</dd></div></dl>}{error && <div className="quote-error"><Info size={17} />{error}</div>}<button className="primary-action full" disabled={busy || !signedIn || !selectedSlot || !catalog.outlet.counter_id} onClick={() => void placeOrder()}>{busy ? <LoaderCircle size={18} /> : <CreditCard size={18} />}{busy ? 'Placing order…' : 'Simulate UPI & place order'}</button><small>Full slots are disabled. Your order receives a live token and enters the canteen board immediately.</small></aside></section>{placedOrder && <div className="order-modal-backdrop" role="presentation"><motion.section className="order-placed-modal" role="dialog" aria-modal="true" aria-labelledby="order-placed-title" initial={{ opacity: 0, scale: .9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}><div className="order-success-icon"><CheckCircle2 size={34} /></div><span className="eyebrow">Payment simulation successful</span><h2 id="order-placed-title">Order placed!</h2><p>Your order has reached the canteen and kitchen. Track every status change live.</p><div className="placed-token"><span>Your pickup token</span><strong>{placedOrder.token_label ?? 'Generating…'}</strong><small>{placedOrder.public_number}</small></div><button className="primary-action full" onClick={() => navigate(`/orders/${placedOrder.id}`)}>Track my order <ArrowRight size={18} /></button></motion.section></div>}</PageFrame>
}

function StudentOrdersPage() {
  const [orders, setOrders] = useState<StudentOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const refresh = () => void getOrders().then(setOrders).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Orders could not load.')); refresh(); const timer = window.setInterval(refresh, 4_000); return () => window.clearInterval(timer) }, [])
  if (!readSession()) return <PageFrame title="Your orders"><EmptyPanel text="Sign in as a student to see live pickup orders." action={<Link className="primary-action" to="/auth">Sign in</Link>} /></PageFrame>
  return <PageFrame title="Your orders" eyebrow="Live pickup tracking">{error && <div className="quote-error"><Info size={17} />{error}</div>}<div className="order-list">{orders.length ? orders.map((order) => <Link to={`/orders/${order.id}`} key={order.id}><span><b>{order.token_label ?? 'Token pending'}</b><small>{order.public_number}</small></span><strong>{titleCase(order.status_code)}</strong><ChevronRight size={18} /></Link>) : <EmptyPanel text="No orders yet. Place one from the live menu." />}</div></PageFrame>
}

function StudentOrderDetailPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState<StudentOrder | null>(null)
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!orderId) return; const refresh = () => void Promise.all([getOrder(orderId), getQueueStatus()]).then(([nextOrder, nextQueue]) => { setOrder(nextOrder); setQueue(nextQueue) }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Order could not load.')); refresh(); const timer = window.setInterval(refresh, 3_000); return () => window.clearInterval(timer) }, [orderId])
  if (error) return <SystemState title="Order unavailable" detail={error} />
  if (!order) return <Splash />
  const stages = ['placed', 'confirmed', 'preparing', 'ready_for_pickup', 'collected']
  const current = Math.max(0, stages.indexOf(order.status_code))
  return <PageFrame title={`Token ${order.token_label ?? 'pending'}`} eyebrow={order.public_number} action={<Link className="secondary-action" to="/orders">All orders</Link>}><section className="tracking-card"><div className="tracking-hero"><ReceiptText size={25} /><div><span>Current status</span><h2>{titleCase(order.status_code)}</h2></div>{queue && <b>{queue.estimated_wait_minutes} min wait</b>}</div><div className="tracking-steps">{stages.map((stage, index) => <div className={index <= current ? 'done' : ''} key={stage}><i>{index < current ? '✓' : index + 1}</i><span>{titleCase(stage)}</span></div>)}</div>{order.pickup_starts_at && <div className="pickup-callout"><Clock3 size={19} /><span>Pickup slot {new Date(order.pickup_starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(order.pickup_ends_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}<div className="order-items">{order.items.map((item) => <div key={item.id}><span>{item.quantity}× {item.name}</span></div>)}</div></section></PageFrame>
}

function StudentAuthPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const finish = (session: Awaited<ReturnType<typeof createDemoSession>>) => { saveSession(session); navigate(-1) }
  const demo = async (role: 'student_aarav' | 'student_meera') => { setBusy(true); setError(null); try { finish(await createDemoSession(role)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Student sign-in failed.') } finally { setBusy(false) } }
  const requestCode = async () => { setBusy(true); setError(null); try { const challenge = await requestOtp(phone); setChallengeId(challenge.challenge_id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send a code.') } finally { setBusy(false) } }
  const confirmCode = async () => { if (!challengeId) return; setBusy(true); setError(null); try { saveSession(await verifyOtp({ challenge_id: challengeId, phone, code, display_name: name || undefined })); navigate(-1) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not verify the code.') } finally { setBusy(false) } }
  return <PublicFrame><section className="auth-card"><Link className="back-link" to="/"><ArrowLeft size={17} />Back to menu</Link><span className="eyebrow">Student access</span><h1>Choose your account</h1><p>Select an available student account or continue with phone OTP.</p><div className="demo-identities"><button disabled={busy} onClick={() => void demo('student_aarav')}><b>Aarav Sharma</b><span>Student account</span></button><button disabled={busy} onClick={() => void demo('student_meera')}><b>Meera Nair</b><span>Student account</span></button></div><div className="auth-divider"><span>or use phone OTP</span></div>{!challengeId ? <><label className="note-field"><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="note-field"><span>Mobile number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" /></label><button className="secondary-action" disabled={busy || !phone} onClick={() => void requestCode()}>Send OTP</button></> : <><label className="note-field"><span>Six-digit code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button className="primary-action full" disabled={busy || code.length !== 6} onClick={() => void confirmCode()}>Verify</button></>}{error && <div className="quote-error"><Info size={17} />{error}</div>}<small>Account availability depends on the configured authentication environment.</small></section></PublicFrame>
}

export function LegacyCheckoutPage({ catalog }: { catalog: OutletCatalog }) {
  const navigate = useNavigate()
  const { lines, count } = useCart()
  const session = readSession()
  const [checkoutStartedAt] = useState(() => Date.now())
  const signedIn = Boolean(session && Date.parse(session.expires_at) > checkoutStartedAt)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  useEffect(() => { if (!lines.length) return; setQuoting(true); setQuoteError(null); void getQuote(lines).then(setQuote).catch((error: unknown) => setQuoteError(error instanceof Error ? error.message : 'The server quote could not load.')).finally(() => setQuoting(false)) }, [lines])
  if (!lines.length) return <Navigate to="/cart" replace />
  return <PageFrame title="Checkout" eyebrow="Review before placing your order" back={() => navigate(-1)}><section className="checkout-layout"><div className="checkout-main"><section className="checkout-section"><span className="step-label">1</span><div><h2>Pickup details</h2><p>Collect from <strong>{catalog.outlet.name}</strong> at {catalog.outlet.canteen_name}.</p><div className="pickup-callout"><MapPin size={19} /><span>Keep your order token ready when you reach the counter.</span></div></div></section><section className="checkout-section"><span className="step-label">2</span><div><h2>{signedIn ? 'Phone verified' : 'Verify your phone'}</h2><p>{signedIn ? 'Your Mealy account is ready for a secure checkout.' : 'Sign in with a one-time code before starting payment. There is no password.'}</p>{!signedIn && <Link className="secondary-action" to="/auth">Sign in with OTP <ArrowRight size={16} /></Link>}</div></section><section className="checkout-section"><span className="step-label">3</span><div><h2>Pay online with Razorpay</h2><p>Mealy will use Razorpay Checkout for online payment. Cash and pay-at-counter are not available for student orders.</p><div className="payment-method-card"><CreditCard size={20} /><span><b>Secure online payment</b><small>UPI and other enabled methods will appear when the backend Razorpay flow is connected.</small></span><span className="payment-status">Setup pending</span></div></div></section></div><aside className="checkout-summary"><h2>Order summary</h2><p>{count} live menu item{count === 1 ? '' : 's'}</p>{quoting && <div className="quote-loading"><LoaderCircle size={17} />Calculating server quote…</div>}{quoteError && <div className="quote-error"><Info size={17} />{quoteError}</div>}{quote && <dl><div><dt>Subtotal</dt><dd>{money(quote.subtotal_minor, quote.currency_code)}</dd></div><div><dt>Tax and charges</dt><dd>{money(quote.tax_total_minor + quote.charge_total_minor, quote.currency_code)}</dd></div><div className="grand-total"><dt>Total</dt><dd>{money(quote.total_minor, quote.currency_code)}</dd></div></dl>}{signedIn ? <button className="primary-action full" disabled><CreditCard size={18} />Razorpay setup pending</button> : <Link className="primary-action full" to="/auth"><CreditCard size={18} />Sign in to continue</Link>}<small>Totals are quoted by Mealy and expire after five minutes. Payment cannot begin until the server-side Razorpay verification flow is implemented.</small></aside></section></PageFrame>
}

export function LegacyOrdersPage() { return <PageFrame title="Your orders" eyebrow="Track every pickup in one place"><EmptyPanel text="Student order history becomes available after phone authentication is connected to the backend." action={<Link className="secondary-action" to="/auth">View sign-in status</Link>} /></PageFrame> }

export function LegacyOrderDetailPage() { return <PageFrame title="Order details"><EmptyPanel text="No order record can be shown until student authentication and order retrieval are connected." /></PageFrame> }

function ProfilePage({ catalog }: { catalog: OutletCatalog }) { return <PageFrame title="Profile" eyebrow="Your Mealy account"><section className="profile-grid"><article className="profile-card"><div className="profile-avatar">M</div><div><h2>Sign in to Mealy</h2><p>Phone authentication is not configured in this backend yet.</p></div><Link className="primary-action" to="/auth">Sign-in status</Link></article><section className="settings-list"><Link to="/campus"><MapPin size={19} /><span><b>Pickup context</b><small>{catalog.outlet.name}, {catalog.outlet.canteen_name}</small></span><ChevronRight size={18} /></Link><Link to="/help"><HelpCircle size={19} /><span><b>Help and support</b><small>Order and pickup assistance</small></span><ChevronRight size={18} /></Link><div><Bell size={19} /><span><b>Order notifications</b><small>Live in-app alerts for every preparation status</small></span><Info size={18} /></div></section></section></PageFrame> }

function CampusPage({ catalog }: { catalog: OutletCatalog }) { return <PageFrame title="Pickup context" eyebrow="Live menu context"><section className="context-page"><div className="context-visual"><MapPin size={26} /></div><span className="eyebrow">Current outlet</span><h1>{catalog.outlet.name}</h1><p>{catalog.outlet.canteen_name} · typical preparation time {catalog.outlet.preparation_lead_minutes} minutes.</p><div className="context-status"><i className={catalog.outlet.accepts_orders ? 'open' : 'closed'} />{catalog.outlet.accepts_orders ? 'Accepting pickup orders' : 'Not accepting orders right now'}</div><small>Campus switching needs the student context API. This page never invents another campus or outlet.</small></section></PageFrame> }

function WelcomePage() { return <PublicFrame><section className="welcome"><img src={mealyLogo} alt="Mealy" /><span className="eyebrow">Campus food ordering</span><h1>Order ahead. Pick up with your token.</h1><p>Browse live canteen availability, place a secure pickup order, and follow its preparation status.</p><Link className="primary-action" to="/">Explore live menu <ArrowRight size={18} /></Link><small>Mealy shows only live canteen data.</small></section></PublicFrame> }

export function LegacyAuthPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestCode = async () => { setBusy(true); setError(null); try { const challenge = await requestOtp(phone); setChallengeId(challenge.challenge_id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send a code.') } finally { setBusy(false) } }
  const confirmCode = async () => { if (!challengeId) return; setBusy(true); setError(null); try { saveSession(await verifyOtp({ challenge_id: challengeId, phone, code, display_name: name || undefined })); navigate('/') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not verify the code.') } finally { setBusy(false) } }
  return <PublicFrame><section className="auth-card"><Link className="back-link" to="/"><ArrowLeft size={17} />Back to menu</Link><span className="eyebrow">Student account</span><h1>{challengeId ? 'Enter your code' : 'Sign in with your phone'}</h1><p>Mealy uses a one-time code. There is no password to create or remember.</p>{!challengeId ? <><label className="note-field"><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name for a new account" /></label><label className="note-field"><span>Mobile number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" inputMode="tel" /></label><button className="primary-action full" disabled={busy || !phone} onClick={() => void requestCode()}>{busy ? 'Sending...' : 'Send OTP'}</button></> : <><label className="note-field"><span>Six-digit code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label><button className="primary-action full" disabled={busy || code.length !== 6} onClick={() => void confirmCode()}>{busy ? 'Verifying...' : 'Verify and continue'}</button><button className="secondary-action" disabled={busy} onClick={() => void requestCode()}>Send a new code</button></>}{error && <div className="quote-error"><Info size={17} />{error}</div>}<small>Until an SMS partner is chosen, local development codes are written only to the backend log. Production delivery is disabled.</small></section></PublicFrame>
}

function HelpPage() { return <PublicFrame><section className="help-card"><Link className="back-link" to="/"><ArrowLeft size={17} />Back to Mealy</Link><span className="eyebrow">Help and support</span><h1>Ordering help</h1><div className="help-list"><div><Clock3 /><span><b>Pickup timing</b><small>Preparation estimates come from the canteen's live outlet settings.</small></span></div><div><ReceiptText /><span><b>Order status</b><small>Your live order timeline will be available after student authentication is connected.</small></span></div><div><HelpCircle /><span><b>Need assistance?</b><small>Contact details will appear here when configured by the canteen.</small></span></div></div></section></PublicFrame> }

function PublicFrame({ children }: { children: ReactNode }) { return <div className="public-frame"><div className="public-brand"><img src={mealyLogo} alt="Mealy" /></div>{children}</div> }

function PageFrame({ title, eyebrow, back, action, children }: { title: string; eyebrow?: string; back?: () => void; action?: ReactNode; children: ReactNode }) { return <div className="page-frame"><header className="page-heading">{back && <button className="back-button" onClick={back} aria-label="Go back"><ArrowLeft size={19} /></button>}<div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1></div>{action}</header>{children}</div> }

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) { return <div className="section-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div> }

function EmptyPanel({ text, action }: { text: string; action?: ReactNode }) { return <div className="empty-panel"><PackageOpen size={25} /><h2>Nothing to show yet</h2><p>{text}</p>{action}</div> }
function EmptyInline({ text }: { text: string }) { return <p className="empty-inline">{text}</p> }
