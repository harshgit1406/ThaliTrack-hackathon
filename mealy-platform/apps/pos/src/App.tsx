import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeIndianRupee,
  Bell,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  Flame,
  Grid2X2,
  History,
  Keyboard,
  Minus,
  MoreHorizontal,
  PackageOpen,
  PauseCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Soup,
  Ticket,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import mealyLogo from './assets/mealy-logo.png'
import { getBillSubtotal, getItemCount, updateCartQuantity } from './lib/cart'
import {
  cancelOrder,
  createCounterOrder,
  createOfflineCashOrder,
  hasStaffSession,
  loadMenu,
  loadOrders,
  loadPosContext,
  loadReceipt,
  openPosShift,
  refundOrder,
  setItemAvailability,
  settleCounterOrder,
  signInStaff,
  signOutStaff,
  transitionOrder,
  type PosContext,
} from './services/menu-service'
import type { Availability, CartLine, MenuItem, OrderStatus, PosOrder, PosView, Toast } from './types'

const rupees = (minorUnits: number) => `₹${(minorUnits / 100).toFixed(0)}`
const categoryIcons = [Grid2X2, Flame, Soup, UtensilsCrossed, PackageOpen, Coffee, ShoppingBag]

const navItems: Array<{ id: PosView; label: string; icon: typeof ReceiptText }> = [
  { id: 'new-bill', label: 'New bill', icon: ReceiptText },
  { id: 'online-orders', label: 'Online orders', icon: PackageOpen },
  { id: 'active-tokens', label: 'Active tokens', icon: Ticket },
  { id: 'history', label: 'History', icon: History },
]

type HeldBill = { id: number; lines: CartLine[]; note: string; savedAt: string }
type PaymentMethod = 'Cash' | 'UPI' | 'Card'
type PaymentLine = { id: number; method: PaymentMethod; amount: string }

function readSavedBill(): CartLine[] {
  try {
    const saved = window.localStorage.getItem('mealy-pos-draft-bill:v1')
    return saved ? (JSON.parse(saved) as CartLine[]) : []
  } catch {
    window.localStorage.removeItem('mealy-pos-draft-bill:v1')
    return []
  }
}

function nextStatus(status: OrderStatus): OrderStatus {
  if (status === 'Ready') return 'Collected'
  return status
}

function statusAction(status: OrderStatus) {
  if (status === 'Ready') return 'Complete collection'
  return ''
}

export function App() {
  const [view, setView] = useState<PosView>('new-bill')
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartLine[]>(readSavedBill)
  const [orders, setOrders] = useState<PosOrder[]>([])
  const [activeCategory, setActiveCategory] = useState('All items')
  const [query, setQuery] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI')
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [isCharging, setIsCharging] = useState(false)
  const [availabilityMenu, setAvailabilityMenu] = useState<string | null>(null)
  const [lowQuantityDraft, setLowQuantityDraft] = useState('5')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sortMode, setSortMode] = useState<'Popular' | 'Name' | 'Price'>('Popular')
  const [profileOpen, setProfileOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [historyQuery, setHistoryQuery] = useState('')
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('mealy-pos-held-bills:v1') ?? '[]') as HeldBill[] } catch { return [] }
  })
  const [signedIn, setSignedIn] = useState(hasStaffSession)
  const [posContext, setPosContext] = useState<PosContext | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const longPressTimer = useRef<number | undefined>(undefined)

  const addToast = useCallback((kind: Toast['kind'], message: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [{ id, kind, message, action }, ...current].slice(0, 2))
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5200)
  }, [])

  const refreshDynamicData = useCallback(async () => {
    try {
      const [nextMenu, nextOrders, nextContext] = await Promise.all([loadMenu(), loadOrders(), loadPosContext()])
      setMenu(nextMenu)
      setOrders(nextOrders)
      setPosContext(nextContext)
      setSignedIn(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live POS data could not load.'
      if (message.toLowerCase().includes('sign in')) setSignedIn(false)
      else addToast('error', message)
    }
  }, [addToast])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshDynamicData(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshDynamicData])

  useEffect(() => {
    if (!signedIn) return
    const timer = window.setInterval(() => {
      void loadOrders().then(setOrders).catch(() => undefined)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [signedIn])

  useEffect(() => {
    window.localStorage.setItem('mealy-pos-draft-bill:v1', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    const showOnline = () => { setOnline(true); addToast('success', 'Connection restored. Pending changes will sync automatically.') }
    const showOffline = () => { setOnline(false); addToast('info', 'Offline mode is active. Bills remain safe on this device.') }
    window.addEventListener('online', showOnline)
    window.addEventListener('offline', showOffline)
    return () => { window.removeEventListener('online', showOnline); window.removeEventListener('offline', showOffline) }
  }, [addToast])

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault()
        setView('new-bill')
        window.setTimeout(() => document.getElementById('item-search')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const newOrderCount = orders.filter((order) => order.status === 'New').length
  const activeOrders = orders.filter((order) => !['New', 'Collected', 'Cancelled'].includes(order.status))
  const historyOrders = orders.filter((order) => ['Collected', 'Cancelled'].includes(order.status))
  const categories = useMemo(() => ['All items', ...Array.from(new Set(menu.map((item) => item.category)))], [menu])
  const subtotal = getBillSubtotal(cart)
  const itemCount = getItemCount(cart)
  const splitTotal = paymentLines.reduce((total, line) => total + (Number.isFinite(Number(line.amount)) ? Math.round(Number(line.amount) * 100) : 0), 0)
  const splitRemaining = subtotal - splitTotal
  const splitMethods = paymentLines.filter((line) => Number(line.amount) > 0).map((line) => line.method)

  const visibleMenu = useMemo(() => {
    const filtered = menu.filter((item) => {
      const matchesCategory = activeCategory === 'All items' || item.category === activeCategory
      const term = query.trim().toLowerCase()
      return matchesCategory && (!term || `${item.name} ${item.description}`.toLowerCase().includes(term))
    })
    if (sortMode === 'Name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    if (sortMode === 'Price') return [...filtered].sort((a, b) => a.price - b.price)
    return filtered
  }, [activeCategory, menu, query, sortMode])

  const navigate = (nextView: PosView) => {
    setView(nextView)
    setProfileOpen(false)
    setAvailabilityMenu(null)
  }

  const changeQuantity = (item: MenuItem, change: number) => setCart((current) => updateCartQuantity(current, item, change))

  const addItem = (item: MenuItem) => {
    if (item.availability === 'sold-out') {
      addToast('error', `${item.name} is sold out. Update its availability when the kitchen is ready.`)
      return
    }
    changeQuantity(item, 1)
    addToast('success', `${item.name} added to the bill.`)
  }

  const changeAvailability = async (id: string, availability: Availability) => {
    const selected = menu.find((item) => item.id === id)
    try {
      await setItemAvailability(id, availability !== 'sold-out')
      setMenu((current) => current.map((item) => item.id === id ? { ...item, availability } : item))
      setAvailabilityMenu(null)
      addToast('success', `${selected?.name ?? 'Item'} availability updated.`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Availability could not be updated.')
    }
  }

  const saveLowQuantity = () => {
    const quantity = Number.parseInt(lowQuantityDraft, 10)
    if (!Number.isFinite(quantity) || quantity < 1) {
      addToast('error', 'Enter a quantity of at least 1.')
      return
    }
    setAvailabilityMenu(null)
    addToast('info', 'Quantity changes require the inventory API and were not saved locally.')
  }

  const startSplitPayment = () => {
    setIsSplitPayment(true)
    if (!paymentLines.length) setPaymentLines([{ id: Date.now(), method: paymentMethod, amount: (subtotal / 100).toFixed(0) }])
  }

  const setSinglePayment = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setIsSplitPayment(false)
    setPaymentLines([])
  }

  const updatePaymentLine = (id: number, changes: Partial<PaymentLine>) => {
    setPaymentLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line))
  }

  const submitCharge = async () => {
    if (!cart.length) return
    if (!online && (isSplitPayment ? splitMethods.some((method) => method !== 'Cash') : paymentMethod !== 'Cash')) {
      addToast('error', 'UPI and Card need a connection. Use Cash only, or reconnect.', { label: 'Use Cash', onClick: () => setSinglePayment('Cash') })
      return
    }
    setIsCharging(true)
    try {
      if (!posContext) throw new Error('POS context is unavailable. Sign in again.')
      if (isSplitPayment && (splitRemaining !== 0 || splitMethods.length === 0)) throw new Error('Split payment amounts must equal the bill total.')
      const selected = isSplitPayment ? paymentLines.filter((line) => Number(line.amount) > 0) : [{ id: 0, method: paymentMethod, amount: (subtotal / 100).toString() }]
      if (!online) {
        if (isSplitPayment || paymentMethod !== 'Cash') throw new Error('Offline orders support cash only.')
        const offlineOrder = await createOfflineCashOrder(cart, savedNote, posContext)
        setOrders((current) => [offlineOrder, ...current])
        setCart([]); setSavedNote(''); setNote(''); window.localStorage.removeItem('mealy-pos-draft-bill:v1')
        addToast('success', `${offlineOrder.displayId} saved locally with token ${offlineOrder.token}. It will reconcile automatically.`)
        return
      }
      const tenders = selected.map((line) => {
        const methodCode = line.method.toLowerCase()
        const config = posContext.payment_methods.find((entry) => entry.method_code === methodCode)
        if (!config) throw new Error(`${line.method} is not configured for this outlet.`)
        const reference = line.method === 'Cash' ? undefined : window.prompt(`Enter the ${line.method} transaction reference`)?.trim()
        if (line.method !== 'Cash' && !reference) throw new Error(`${line.method} needs a transaction reference.`)
        return { payment_method_config_id: config.id, amount_minor: Math.round(Number(line.amount) * 100), ...(reference ? { reference } : {}) }
      })
      if (tenders.some((tender, index) => selected[index]?.method === 'Cash') && !posContext.open_shift) {
        throw new Error('Open the cash drawer shift before accepting cash.')
      }
      const newOrder = await createCounterOrder(cart, savedNote)
      const receipt = await settleCounterOrder(newOrder.id, posContext.open_shift?.id, tenders)
      setOrders((current) => [newOrder, ...current])
      setCart([])
      setSavedNote('')
      setNote('')
      setIsSplitPayment(false)
      setPaymentLines([])
      window.localStorage.removeItem('mealy-pos-draft-bill:v1')
      addToast('success', `${newOrder.displayId} paid. Token ${newOrder.token}${receipt ? ` · Receipt ${receipt.receipt_number}` : ''}`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'The order could not be created.')
    } finally {
      setIsCharging(false)
    }
  }

  const holdBill = () => {
    if (!cart.length) { addToast('info', 'Add an item before holding this bill.'); return }
    const held: HeldBill = { id: Date.now(), lines: cart, note: savedNote, savedAt: new Date().toISOString() }
    const existing = JSON.parse(window.localStorage.getItem('mealy-pos-held-bills:v1') ?? '[]')
    window.localStorage.setItem('mealy-pos-held-bills:v1', JSON.stringify([held, ...existing]))
    setHeldBills((current) => [held, ...current])
    setCart([])
    setSavedNote('')
    setNote('')
    addToast('success', 'Bill held locally. Start a new bill whenever you are ready.')
  }

  const acceptOrder = async (id: string) => {
    try {
      await transitionOrder(id, 'confirmed')
      await refreshDynamicData()
      addToast('success', 'Order accepted and refreshed from the backend.')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'The order could not be accepted.')
    }
  }

  const advanceOrder = async (order: PosOrder) => {
    if (order.status !== 'Ready') { addToast('info', 'Preparation is controlled from the kitchen display.'); return }
    const status = nextStatus(order.status)
    const apiStatus = status === 'Preparing' ? 'preparing' : status === 'Ready' ? 'ready_for_pickup' : status === 'Collected' ? 'collected' : 'confirmed'
    try {
      await transitionOrder(order.id, apiStatus)
      await refreshDynamicData()
      addToast('success', `${order.token} is now ${status.toLowerCase()}.`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'The order status could not be updated.')
    }
  }

  const startLongPress = (itemId: string) => { longPressTimer.current = window.setTimeout(() => setAvailabilityMenu(itemId), 550) }
  const cancelLongPress = () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current) }

  const handleStaffLogin = async (employeeCode: string, pin: string) => {
    setLoginBusy(true)
    setLoginError('')
    try {
      await signInStaff(employeeCode, pin)
      setSignedIn(true)
      await refreshDynamicData()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Sign-in failed.')
    } finally {
      setLoginBusy(false)
    }
  }

  const handleOpenShift = async () => {
    const register = posContext?.cash_registers[0]
    if (!register) { addToast('error', 'No cash register is assigned to this terminal.'); return }
    const value = window.prompt('Opening cash amount in rupees', '0')
    if (value === null) return
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) { addToast('error', 'Enter a valid opening cash amount.'); return }
    try {
      const shift = await openPosShift(register.id, Math.round(amount * 100))
      setPosContext((current) => current ? { ...current, open_shift: shift } : current)
      addToast('success', 'Cash shift opened.')
    } catch (error) { addToast('error', error instanceof Error ? error.message : 'Shift could not be opened.') }
  }

  const handleReceipt = async (order: PosOrder) => {
    try {
      const { receipt } = await loadReceipt(order.id)
      addToast('success', `Receipt ${receipt.receipt_number} is ready to print.`)
      window.print()
    } catch (error) { addToast('error', error instanceof Error ? error.message : 'Receipt could not be loaded.') }
  }

  const handleCancel = async (order: PosOrder) => {
    const note = window.prompt(`Why is ${order.displayId} being cancelled?`)?.trim()
    if (!note) return
    try {
      await cancelOrder(order.id, note)
      await refreshDynamicData()
      addToast('success', `${order.displayId} was cancelled with an audit reason.`)
    } catch (error) { addToast('error', error instanceof Error ? error.message : 'Order could not be cancelled.') }
  }

  const handleRefund = async (order: PosOrder) => {
    const note = window.prompt(`Refund reason for ${order.displayId}`)?.trim()
    if (!note) return
    const reference = window.prompt('UPI/card refund reference (leave blank for cash)')?.trim() || undefined
    try {
      await refundOrder(order.id, note, reference)
      await refreshDynamicData()
      addToast('success', `${order.displayId} was fully refunded and recorded.`)
    } catch (error) { addToast('error', error instanceof Error ? error.message : 'Refund could not be completed.') }
  }

  if (!signedIn) return <StaffLogin busy={loginBusy} error={loginError} onSubmit={handleStaffLogin} />

  return (
    <div className="app-shell" onClick={() => { if (availabilityMenu) setAvailabilityMenu(null) }}>
      <div className="app-frame">
        <header className="topbar">
          <button className="brand-lockup" onClick={() => navigate('new-bill')} aria-label="Go to new bill"><img src={mealyLogo} alt="Mealy" /></button>
          <nav className="main-nav" aria-label="POS navigation">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${view === id ? 'nav-active' : ''}`} onClick={() => navigate(id)}>
                <Icon size={19} strokeWidth={1.9} />{label}
                {id === 'online-orders' && newOrderCount > 0 && <span className="count-badge">{newOrderCount}</span>}
              </button>
            ))}
          </nav>
          <div className="staff-area">
              <span className={`connection ${online ? '' : 'offline'}`}><span />{online ? 'Online' : 'Offline'}</span>
            <button className="header-icon" onClick={() => addToast('info', 'You are all caught up. No unread system alerts.')} aria-label="Notifications"><Bell size={19} /></button>
            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}><span className="avatar">POS</span><span>{posContext?.user.display_name ?? 'Current session'}</span><ChevronDown size={15} /></button>
              {profileOpen && <div className="profile-menu">
                <div><strong>Authenticated operator</strong><span>Identity comes from the configured access token</span></div>
                <button onClick={() => { setProfileOpen(false); addToast('info', posContext?.open_shift ? `Cash shift opened ${new Date(posContext.open_shift.opened_at).toLocaleString()}.` : 'No cash shift is open on this terminal.') }}>View shift status</button>
                {!posContext?.open_shift && <button onClick={() => { setProfileOpen(false); void handleOpenShift() }}>Open cash shift</button>}
                <button onClick={() => { setProfileOpen(false); setSignedIn(false) }}>Lock POS</button>
                <button onClick={() => { setProfileOpen(false); void signOutStaff().finally(() => { setSignedIn(false); setPosContext(null) }) }}>Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        {!online && <div className="offline-banner"><WifiOff size={16} />Cloud connection lost. Cash orders continue through the outlet gateway and sync automatically.</div>}

        {view === 'new-bill' ? (
          <main className="pos-layout">
            <aside className="category-panel" aria-label="Menu categories">
              <div className="panel-title"><h2>Categories</h2><span>{menu.length} items</span></div>
              <div className="category-list">
                {categories.map((category, index) => {
                  const Icon = categoryIcons[index]
                  return <button key={category} className={`category-button ${category === activeCategory ? 'selected' : ''}`} onClick={() => setActiveCategory(category)}><Icon size={19} strokeWidth={1.8} /><span>{category}</span></button>
                })}
              </div>
              <div className="help-card"><Keyboard size={18} /><p><strong>Quick add</strong><br />Press <kbd>/</kbd> to search. Long-press a card for availability.</p></div>
            </aside>

            <section className="menu-workspace" aria-label="Menu items">
              <div className="search-row"><Search size={20} /><input id="item-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items, snacks, drinks…" aria-label="Search menu items" /><span>Press <kbd>/</kbd> to focus</span></div>
              <div className="menu-heading">
                <div><h1>{activeCategory}</h1><p>{visibleMenu.length} items available</p></div>
                <button className="sort-button" onClick={() => setSortMode((current) => current === 'Popular' ? 'Name' : current === 'Name' ? 'Price' : 'Popular')}>Sort: <strong>{sortMode}</strong><ChevronDown size={15} /></button>
              </div>
              {visibleMenu.length ? <div className="menu-grid">
                {visibleMenu.map((item) => {
                  const quantity = cart.find((line) => line.item.id === item.id)?.quantity ?? 0
                  return <article key={item.id} className={`menu-card ${item.availability === 'sold-out' ? 'is-unavailable' : ''} ${quantity ? 'has-quantity' : ''}`} onPointerDown={() => startLongPress(item.id)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}>
                  <button className="card-add-area" onClick={() => addItem(item)} aria-label={`Add ${item.name} to bill`}>
                    <div className="food-visual">{item.image ? <img src={item.image} alt="" /> : <span aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span>}{item.availability === 'low-stock' && <em>{item.remaining} left</em>}</div>
                    <div className="item-copy"><h3>{item.name}</h3><p>{item.description}</p><strong>{rupees(item.price)}</strong></div>
                  </button>
                  {quantity > 0 && <div className="menu-quantity" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button onClick={() => changeQuantity(item, -1)} aria-label={`Remove one ${item.name}`}><Minus size={13} /></button><strong>{quantity}</strong><button onClick={() => changeQuantity(item, 1)} aria-label={`Add one ${item.name}`}><Plus size={13} /></button></div>}
                  <button className="item-more" onClick={(event) => { event.stopPropagation(); setLowQuantityDraft(String(item.remaining ?? 5)); setAvailabilityMenu(availabilityMenu === item.id ? null : item.id) }} aria-label={`Change ${item.name} availability`}><MoreHorizontal size={19} /></button>
                  {availabilityMenu === item.id && <div className="availability-popover" onClick={(event) => event.stopPropagation()}>
                    <p>Quick availability</p>
                    <button className={item.availability === 'sold-out' ? 'available-option' : 'danger-option'} onClick={() => changeAvailability(item.id, item.availability === 'sold-out' ? 'available' : 'sold-out')}>{item.availability === 'sold-out' ? 'Mark available' : 'Mark sold out'}</button>
                    {item.availability === 'low-stock' ? <div className="quantity-editor"><label htmlFor={`quantity-${item.id}`}>Quantity left</label><div><input id={`quantity-${item.id}`} type="number" min="1" value={lowQuantityDraft} onChange={(event) => setLowQuantityDraft(event.target.value)} /><button onClick={saveLowQuantity}>Save</button></div></div> : item.availability !== 'sold-out' && <button onClick={() => addToast('info', 'Inventory quantities are managed by an outlet manager.')}>Manage inventory quantity</button>}
                  </div>}
                  </article>
                })}
              </div> : <div className="empty-menu"><Search size={30} /><h2>No matching items</h2><p>Try another search or category. Your current bill is unchanged.</p><button onClick={() => { setQuery(''); setActiveCategory('All items') }}>Show all items</button></div>}
            </section>

            <aside className="bill-panel" aria-label="Current bill">
              <div className="bill-heading"><div><p>Current bill</p><h2>New counter order</h2></div><button className="clear-bill-button" onClick={() => { setCart([]); setSavedNote(''); setNote(''); addToast('info', 'Current bill cleared.') }}>Clear</button></div>
              <div className="order-type-toggle" aria-label="Order type"><button className="active" disabled><ShoppingBag size={17} />Counter pickup</button></div>
              {heldBills.length > 0 && <div className="held-bill"><div><PauseCircle size={15} /><span><strong>{heldBills.length} held bill{heldBills.length > 1 ? 's' : ''}</strong><small>Saved on this terminal</small></span></div><button onClick={() => { const held = heldBills[0]; setCart(held.lines); setSavedNote(held.note); setHeldBills((current) => current.slice(1)); window.localStorage.setItem('mealy-pos-held-bills:v1', JSON.stringify(heldBills.slice(1))); addToast('success', 'Held bill restored.') }}>Restore latest</button></div>}
              <div className="bill-items">{cart.length ? cart.map((line) => <div className="bill-line" key={line.item.id}>{line.item.image ? <img src={line.item.image} alt="" /> : <span className="bill-item-placeholder">{line.item.name.slice(0, 2).toUpperCase()}</span>}<div className="line-name"><strong>{line.item.name}</strong><span>{rupees(line.item.price)} each</span></div><div className="stepper"><button onClick={() => changeQuantity(line.item, -1)} aria-label={`Remove one ${line.item.name}`}><Minus size={14} /></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.item, 1)} aria-label={`Add one ${line.item.name}`}><Plus size={14} /></button></div><strong>{rupees(line.item.price * line.quantity)}</strong></div>) : <div className="empty-bill"><ShoppingCart size={30} /><h3>Start a new bill</h3><p>Tap an item to add it here.</p></div>}</div>
              {noteOpen ? <div className="note-editor"><textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Kitchen note…" maxLength={120} /><div><button onClick={() => { setNote(savedNote); setNoteOpen(false) }}>Cancel</button><button onClick={() => { setSavedNote(note.trim()); setNoteOpen(false); addToast('success', note.trim() ? 'Kitchen note saved.' : 'Kitchen note removed.') }}>Save note</button></div></div> : <button className={`note-button ${savedNote ? 'has-note' : ''}`} onClick={() => { setNote(savedNote); setNoteOpen(true) }}><Plus size={16} /><span>{savedNote || 'Add note'}</span><small>Visible to kitchen</small></button>}
              <button className="discount-button" onClick={() => addToast('info', 'Discounts will be connected after admin permissions are available.')}>Apply discount <span>Coming soon</span></button>
              <div className="bill-summary"><div><span>Items ({itemCount})</span><strong>{rupees(subtotal)}</strong></div><div><span>Discount</span><strong>{rupees(0)}</strong></div><div className="total-row"><span>Total</span><strong>{rupees(subtotal)}</strong></div></div>
              <div className="payment-options" aria-label="Payment method">{(['Cash', 'UPI', 'Card'] as const).map((method) => { const configured = posContext?.payment_methods.some((entry) => entry.method_code === method.toLowerCase()); return <button key={method} disabled={!configured} title={configured ? undefined : `${method} is not configured`} className={!isSplitPayment && paymentMethod === method ? 'selected' : ''} onClick={() => setSinglePayment(method)}>{method}</button> })}</div>
              {!isSplitPayment ? <button className="split-payment-toggle" onClick={startSplitPayment}><span>Split payment</span><small>Cash, UPI, Card</small></button> : <div className="split-payment-editor"><div className="split-payment-heading"><strong>Split payment</strong><button onClick={() => { setIsSplitPayment(false); setPaymentLines([]) }}>Use one payment</button></div><div className="split-payment-lines">{paymentLines.map((line) => <div className="split-payment-line" key={line.id}><select value={line.method} onChange={(event) => updatePaymentLine(line.id, { method: event.target.value as PaymentMethod })} aria-label="Payment method"><option>Cash</option><option>UPI</option><option>Card</option></select><div><span>₹</span><input type="number" min="0" step="1" inputMode="decimal" value={line.amount} onChange={(event) => updatePaymentLine(line.id, { amount: event.target.value })} aria-label={`${line.method} amount`} /></div>{paymentLines.length > 1 && <button className="remove-payment-line" onClick={() => setPaymentLines((current) => current.filter((entry) => entry.id !== line.id))} aria-label="Remove payment line"><X size={14} /></button>}</div>)}</div><button className="add-payment-line" onClick={() => setPaymentLines((current) => [...current, { id: Date.now() + current.length, method: 'UPI', amount: '0' }])}><Plus size={14} />Add payment</button><div className={`split-payment-balance ${splitRemaining === 0 && splitMethods.length ? 'is-balanced' : ''}`}><span>{splitRemaining === 0 && splitMethods.length ? 'Recorded total' : splitRemaining > 0 ? 'Unallocated' : 'Extra recorded'}</span><strong>{splitRemaining === 0 && splitMethods.length ? rupees(splitTotal) : rupees(Math.abs(splitRemaining))}</strong></div></div>}
              <div className="charge-actions"><button className="hold-button" onClick={holdBill} title="Save this bill locally and start another bill"><PauseCircle size={19} />Hold</button><button className="charge-button" disabled={isCharging || !cart.length} onClick={submitCharge}>{isCharging ? <><RefreshCw className="spin" size={20} />Processing…</> : <><span>Charge {rupees(subtotal)}</span><ArrowRight size={18} /></>}</button></div>
              <p className="bill-footnote">{online ? <><Wifi size={14} />Connected to the Mealy backend</> : <><Clock3 size={14} />Gateway offline-cash mode</>}</p>
            </aside>
          </main>
        ) : (
          <OperationsView view={view} orders={orders} activeOrders={activeOrders} historyOrders={historyOrders} historyQuery={historyQuery} onHistoryQuery={setHistoryQuery} onAccept={acceptOrder} onAdvance={advanceOrder} onCancel={handleCancel} onRefund={handleRefund} onNewBill={() => navigate('new-bill')} onToast={addToast} onReceipt={handleReceipt} />
        )}
      </div>

      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}><span className="toast-icon">{toast.kind === 'success' ? <Check size={16} /> : toast.kind === 'error' ? <X size={16} /> : <Bell size={16} />}</span><p>{toast.message}</p>{toast.action && <button onClick={toast.action.onClick}>{toast.action.label}</button>}<button aria-label="Dismiss message" onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}><X size={15} /></button></div>)}</div>
      <div className="debug-status"><BadgeIndianRupee size={12} />Live Mealy API data</div>
    </div>
  )
}

type OperationsViewProps = {
  view: Exclude<PosView, 'new-bill'>
  orders: PosOrder[]
  activeOrders: PosOrder[]
  historyOrders: PosOrder[]
  historyQuery: string
  onHistoryQuery: (value: string) => void
  onAccept: (id: string) => void
  onAdvance: (order: PosOrder) => void
  onCancel: (order: PosOrder) => void
  onRefund: (order: PosOrder) => void
  onNewBill: () => void
  onToast: (kind: Toast['kind'], message: string) => void
  onReceipt: (order: PosOrder) => void
}

function OperationsView({ view, orders, activeOrders, historyOrders, historyQuery, onHistoryQuery, onAccept, onAdvance, onCancel, onRefund, onNewBill, onToast, onReceipt }: OperationsViewProps) {
  const meta = view === 'online-orders'
    ? { eyebrow: 'Live queue', title: 'Online orders', copy: 'Review student-app and QR orders before sending them to the kitchen.' }
    : view === 'active-tokens'
      ? { eyebrow: 'Kitchen flow', title: 'Active tokens', copy: 'Move accepted orders from preparation to collection.' }
      : { eyebrow: 'Completed sales', title: 'Order history', copy: 'Find completed counter, app, and QR orders from this device.' }

  const historyResults = historyOrders.filter((order) => `${order.id} ${order.token} ${order.customer}`.toLowerCase().includes(historyQuery.toLowerCase()))
  const list = view === 'online-orders' ? orders.filter((order) => order.source !== 'Counter POS' && order.status === 'New') : view === 'active-tokens' ? activeOrders : historyResults

  return <main className="operations-page">
    <div className="operations-heading"><div><span>{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.copy}</p></div><button className="primary-action" onClick={onNewBill}><Plus size={18} />New counter bill</button></div>
    <div className="operations-toolbar">
      <div className="queue-metrics"><div><strong>{view === 'online-orders' ? list.length : view === 'active-tokens' ? activeOrders.length : historyOrders.length}</strong><span>{view === 'online-orders' ? 'Waiting review' : view === 'active-tokens' ? 'In progress' : 'Completed today'}</span></div><div><strong>{view === 'history' ? rupees(historyOrders.reduce((sum, order) => sum + order.total, 0)) : '6 min'}</strong><span>{view === 'history' ? 'Recorded sales' : 'Average wait'}</span></div></div>
      {view === 'history' && <label className="history-search"><Search size={18} /><input value={historyQuery} onChange={(event) => onHistoryQuery(event.target.value)} placeholder="Search order, token or customer" /></label>}
    </div>
    {list.length ? <div className="order-list">{list.map((order) => <article className="order-card" key={order.id}>
      <div className="order-card-top"><div className="token-block"><span>{order.token}</span><small>Token</small></div><div className="order-identity"><div><strong>{order.displayId}</strong><span className={`source source-${order.source.toLowerCase().replaceAll(' ', '-')}`}>{order.source}</span></div><h2>{order.customer}</h2><p><Clock3 size={14} />{order.placedAt}</p></div><span className={`status status-${order.status.toLowerCase()}`}>{order.status}</span></div>
      <div className="order-items">{order.items.map((item) => <div key={item.name}><span>{item.quantity}×</span><strong>{item.name}</strong></div>)}</div>
      <div className="order-card-bottom"><strong>{rupees(order.total)}</strong><div>{view === 'online-orders' && <button className="secondary-action" onClick={() => onToast('info', `${order.displayId}: ${order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}`)}>View details</button>}{view === 'online-orders' && <button className="danger-action" onClick={() => onCancel(order)}>Reject</button>}{view === 'online-orders' && <button className="primary-action" onClick={() => onAccept(order.id)}>Accept order</button>}{view === 'active-tokens' && order.status === 'Ready' && <button className="primary-action" onClick={() => onAdvance(order)}>{statusAction(order.status)}<ArrowRight size={16} /></button>}{view === 'active-tokens' && order.status !== 'Ready' && <><span className="kitchen-owned-status">Kitchen controls preparation</span><button className="danger-action" onClick={() => onCancel(order)}>Cancel</button></>}{view === 'history' && order.status === 'Collected' && <button className="danger-action" onClick={() => onRefund(order)}>Refund</button>}{view === 'history' && order.status === 'Collected' && <button className="secondary-action" onClick={() => onReceipt(order)}><ReceiptText size={16} />Print receipt</button>}</div></div>
    </article>)}</div> : <div className="operations-empty"><Check size={30} /><h2>{view === 'history' ? 'No matching orders' : 'Queue is clear'}</h2><p>{view === 'history' ? 'Try another order number, token, or customer.' : 'New orders will appear here automatically.'}</p></div>}
  </main>
}

function StaffLogin({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (employeeCode: string, pin: string) => Promise<void> }) {
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  return <main className="staff-login-shell">
    <form className="staff-login-card" onSubmit={(event) => { event.preventDefault(); void onSubmit(employeeCode, pin) }}>
      <img src={mealyLogo} alt="Mealy" />
      <div><span>Counter POS</span><h1>Start your shift</h1><p>Sign in with the employee code and PIN provided by your manager.</p></div>
      <label>Employee code<input autoFocus autoCapitalize="characters" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())} placeholder="CB-CASHIER-01" required /></label>
      <label>PIN<input type="password" inputMode="numeric" pattern="[0-9]{4,12}" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="••••" required /></label>
      {error && <p className="staff-login-error" role="alert">{error}</p>}
      <button className="primary-action" disabled={busy || !employeeCode || pin.length < 4}>{busy ? <><RefreshCw className="spin" size={18} />Signing in…</> : 'Sign in'}</button>
    </form>
  </main>
}
