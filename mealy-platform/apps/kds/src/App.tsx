import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BellOff,
  Check,
  ChefHat,
  CircleAlert,
  Clock3,
  Expand,
  LoaderCircle,
  MonitorUp,
  Play,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { areAllItemsReady, getElapsedMinutes, getReadyItemCount, getTicketCounts, getUrgency, sortTickets } from './lib/tickets'
import { delayKitchenTicket, isOutletGatewayConfigured, loadKitchenQueue, remakeKitchenTicket, updateTicketItemReadiness, updateTicketStatus } from './services/kds-service'
import type { GatewayState, KitchenTicket, OrderSource, TicketStatus, Toast } from './types'

const lanes: Array<{ status: TicketStatus; label: string; description: string }> = [
  { status: 'new', label: 'New', description: 'Waiting to start' },
  { status: 'preparing', label: 'Preparing', description: 'In the kitchen now' },
  { status: 'ready', label: 'Ready', description: 'Send to pickup' },
]

const sourceClass: Record<OrderSource, string> = {
  'Counter POS': 'source-pos',
  'Student app': 'source-student',
  'QR order': 'source-qr',
}

const INITIAL_NOW = Date.now()

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function formatReceived(isoDate: string) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoDate))
}

function TicketCard({
  ticket,
  now,
  isPending,
  pendingItemKeys,
  gatewayState,
  onAdvance,
  onDelay,
  onRemake,
  onToggleItem,
}: {
  ticket: KitchenTicket
  now: number
  isPending: boolean
  pendingItemKeys: Set<string>
  gatewayState: GatewayState
    onAdvance: (ticket: KitchenTicket) => void
    onDelay: (ticket: KitchenTicket) => void
    onRemake: (ticket: KitchenTicket) => void
  onToggleItem: (ticket: KitchenTicket, itemId: string, ready: boolean) => void
}) {
  const elapsed = getElapsedMinutes(ticket, now)
  const urgency = getUrgency(ticket, now)
  const isReady = ticket.status === 'ready'
  const readyItemCount = getReadyItemCount(ticket)
  const allItemsReady = areAllItemsReady(ticket)
  const remainingItemCount = ticket.items.length - readyItemCount
  const actionLabel = ticket.status === 'new'
    ? 'Start preparing'
    : allItemsReady
      ? 'Mark order ready'
      : `${remainingItemCount} ${remainingItemCount === 1 ? 'item' : 'items'} left`

  return (
    <article className={`ticket-card urgency-${urgency} ${ticket.priority ? 'is-priority' : ''}`}>
      <header className="ticket-card__header">
        <div>
          <div className="ticket-card__eyebrow">
            <span className={`source-chip ${sourceClass[ticket.source]}`}>{ticket.source}</span>
            {ticket.priority && <span className="priority-chip">Priority</span>}
          </div>
          <div className="ticket-card__identity">
            <span className="token-label">Token</span>
            <strong>{ticket.token}</strong>
          </div>
        </div>
        <div className={`elapsed-time elapsed-time--${urgency}`}>
          <Clock3 aria-hidden="true" size={17} />
          <span>{elapsed} min</span>
        </div>
      </header>

      <div className="ticket-meta">
        <span>{ticket.kotNumber}</span>
        <span aria-hidden="true">·</span>
        <span>{formatReceived(ticket.receivedAt)}</span>
        <span className="ticket-meta__order">{ticket.orderNumber}</span>
      </div>

      {ticket.status === 'preparing' && (
        <div className="item-progress" aria-label={`${readyItemCount} of ${ticket.items.length} items ready`}>
          <span><strong>{readyItemCount}/{ticket.items.length}</strong> items ready</span>
          <span className="item-progress__track"><span style={{ width: `${(readyItemCount / ticket.items.length) * 100}%` }} /></span>
        </div>
      )}

      <div className="ticket-items">
        {ticket.items.map((item) => (
          <div className={`ticket-item ${item.status === 'ready' ? 'ticket-item--ready' : ''}`} key={item.id}>
            <span className="ticket-item__quantity">{item.quantity}×</span>
            <div>
              <strong>{item.name}</strong>
              {item.modifiers?.map((modifier) => <span key={modifier}>{modifier}</span>)}
              {item.note && <span className="ticket-item__note">Note: {item.note}</span>}
            </div>
            {ticket.status === 'preparing' && (
              <button
                aria-label={item.status === 'ready' ? `Undo ready for ${item.name}` : `Mark ${item.name} ready`}
                className="item-ready-button"
                disabled={pendingItemKeys.has(`${ticket.id}:${item.id}`) || gatewayState !== 'connected'}
                onClick={() => onToggleItem(ticket, item.id, item.status !== 'ready')}
                title={item.status === 'ready' ? 'Tap to undo' : 'Mark item ready'}
                type="button"
              >
                {pendingItemKeys.has(`${ticket.id}:${item.id}`)
                  ? <LoaderCircle className="spin" aria-hidden="true" size={17} />
                  : <Check aria-hidden="true" size={17} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {ticket.customerNote && (
        <div className="customer-note">
          <CircleAlert aria-hidden="true" size={17} />
          <span>{ticket.customerNote}</span>
        </div>
      )}

      {isReady ? (
        <><div className="ready-confirmation">
          <span className="ready-confirmation__icon"><Check aria-hidden="true" size={19} /></span>
          <span><strong>Ready for pickup</strong><small>Token shown at the counter</small></span>
        </div><button className="exception-button" disabled={isPending || gatewayState !== 'connected'} onClick={() => onRemake(ticket)} type="button"><RotateCcw size={16} />Send for remake</button></>
      ) : (
        <><button className="exception-button" disabled={isPending || gatewayState !== 'connected'} onClick={() => onDelay(ticket)} type="button"><Clock3 size={16} />Add delay</button><button
          className={`advance-button advance-button--${ticket.status}`}
          disabled={isPending || gatewayState !== 'connected' || (ticket.status === 'preparing' && !allItemsReady)}
          onClick={() => onAdvance(ticket)}
          type="button"
        >
          {isPending ? <LoaderCircle className="spin" aria-hidden="true" size={20} /> : ticket.status === 'new' ? <Play aria-hidden="true" size={19} /> : <Check aria-hidden="true" size={20} />}
          {isPending ? 'Updating…' : actionLabel}
        </button></>
      )}
    </article>
  )
}

function Lane({
  status,
  label,
  description,
  tickets,
  now,
  pendingIds,
  pendingItemKeys,
  gatewayState,
  onAdvance,
  onDelay,
  onRemake,
  onToggleItem,
}: {
  status: TicketStatus
  label: string
  description: string
  tickets: KitchenTicket[]
  now: number
  pendingIds: Set<string>
  pendingItemKeys: Set<string>
  gatewayState: GatewayState
    onAdvance: (ticket: KitchenTicket) => void
    onDelay: (ticket: KitchenTicket) => void
    onRemake: (ticket: KitchenTicket) => void
  onToggleItem: (ticket: KitchenTicket, itemId: string, ready: boolean) => void
}) {
  return (
    <section className={`lane lane--${status}`} aria-labelledby={`lane-${status}`}>
      <div className="lane__header">
        <div>
          <h2 id={`lane-${status}`}>{label}</h2>
          <p>{description}</p>
        </div>
        <span className="lane__count">{tickets.length}</span>
      </div>
      <div className="lane__tickets">
        {tickets.length === 0 ? (
          <div className="lane-empty">
            <Check aria-hidden="true" size={26} />
            <strong>All clear</strong>
            <span>No {label.toLowerCase()} tickets</span>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              gatewayState={gatewayState}
              isPending={pendingIds.has(ticket.id)}
              key={ticket.id}
              now={now}
                onAdvance={onAdvance}
                onDelay={onDelay}
                onRemake={onRemake}
              onToggleItem={onToggleItem}
              pendingItemKeys={pendingItemKeys}
              ticket={ticket}
            />
          ))
        )}
      </div>
    </section>
  )
}

function App() {
  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [now, setNow] = useState(INITIAL_NOW)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [gatewayState, setGatewayState] = useState<GatewayState>(isOutletGatewayConfigured ? 'connected' : 'offline')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [pendingItemKeys, setPendingItemKeys] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-1), { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200)
  }

  const refreshQueue = async () => {
    setLoading(true)
    setLoadError('')
    try {
      setTickets(await loadKitchenQueue())
    } catch {
      setLoadError('The kitchen queue could not be loaded. Check the gateway and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let isActive = true

    loadKitchenQueue()
      .then((queue) => {
        if (isActive) setTickets(queue)
      })
      .catch(() => {
        if (isActive) setLoadError('The kitchen queue could not be loaded. Check the gateway and try again.')
      })
      .finally(() => {
        if (isActive) setLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isOutletGatewayConfigured) return
    const refresh = async () => {
      try {
        setTickets(await loadKitchenQueue())
        setGatewayState('connected')
      } catch {
        setGatewayState('offline')
      }
    }
    const timer = window.setInterval(() => void refresh(), 2_000)
    return () => window.clearInterval(timer)
  }, [])

  const sortedTickets = useMemo(() => sortTickets(tickets), [tickets])
  const counts = useMemo(() => getTicketCounts(tickets), [tickets])
  const lateCount = useMemo(
    () => tickets.filter((ticket) => getUrgency(ticket, now) === 'late').length,
    [tickets, now],
  )

  const handleAdvance = async (ticket: KitchenTicket) => {
    const nextStatus: TicketStatus = ticket.status === 'new' ? 'preparing' : 'ready'
    if (pendingIds.has(ticket.id)) return
    setPendingIds((current) => new Set(current).add(ticket.id))

    try {
      const updated = await updateTicketStatus(ticket, nextStatus, gatewayState)
      setTickets((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
      addToast(
        nextStatus === 'preparing' ? `${ticket.token} moved to Preparing` : `${ticket.token} is ready for pickup`,
        'success',
      )
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'This ticket could not be updated.', 'warning')
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(ticket.id)
        return next
      })
    }
  }

  const handleToggleItem = async (ticket: KitchenTicket, itemId: string, ready: boolean) => {
    const item = ticket.items.find((candidate) => candidate.id === itemId)
    const key = `${ticket.id}:${itemId}`
    if (!item || pendingItemKeys.has(key)) return
    setPendingItemKeys((current) => new Set(current).add(key))

    try {
      const updated = await updateTicketItemReadiness(ticket, itemId, ready, gatewayState)
      setTickets((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)))
      addToast(`${item.name} marked ${ready ? 'ready' : 'not ready'} for ${ticket.token}`, ready ? 'success' : 'info')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'This item could not be updated.', 'warning')
    } finally {
      setPendingItemKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  const handleDelay = async (ticket: KitchenTicket) => {
    const reason = window.prompt(`Reason for delaying ${ticket.token}`)?.trim()
    if (!reason) return
    const entered = window.prompt('Additional minutes', '5')
    if (entered === null) return
    const minutes = Number(entered)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) { addToast('Enter a delay from 1 to 60 minutes.', 'warning'); return }
    setPendingIds((current) => new Set(current).add(ticket.id))
    try {
      const updated = await delayKitchenTicket(ticket.id, minutes, reason)
      setTickets((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))
      addToast(`${ticket.token} delayed by ${minutes} minutes`, 'info')
    } catch (error) { addToast(error instanceof Error ? error.message : 'Delay could not be recorded.', 'warning') }
    finally { setPendingIds((current) => { const next = new Set(current); next.delete(ticket.id); return next }) }
  }

  const handleRemake = async (ticket: KitchenTicket) => {
    const reason = window.prompt(`Remake reason for ${ticket.token}`)?.trim()
    if (!reason) return
    setPendingIds((current) => new Set(current).add(ticket.id))
    try {
      const updated = await remakeKitchenTicket(ticket.id, reason)
      setTickets((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))
      addToast(`${ticket.token} returned to preparation`, 'success')
    } catch (error) { addToast(error instanceof Error ? error.message : 'Remake could not be started.', 'warning') }
    finally { setPendingIds((current) => { const next = new Set(current); next.delete(ticket.id); return next }) }
  }

  const handleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  }

  return (
    <div className="kds-app">
      <header className="topbar">
        <div className="brand-area">
          <span className="brand-logo"><img alt="Mealy" src={`${import.meta.env.BASE_URL}mealy-logo.png`} /></span>
          <span className="product-divider" aria-hidden="true" />
          <div>
            <strong>Kitchen Display</strong>
            <span>Central Canteen · Main Kitchen</span>
          </div>
        </div>

        <div className="topbar__actions">
          <div className="clock-block" aria-label={`Current time ${formatClock(new Date(now))}`}>
            <span>{formatClock(new Date(now))}</span>
            <small>{formatDate(new Date(now))}</small>
          </div>
          <button
            aria-label={soundEnabled ? 'Mute new ticket sounds' : 'Enable new ticket sounds'}
            className="icon-button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            title={soundEnabled ? 'Sound on' : 'Sound muted'}
            type="button"
          >
            {soundEnabled ? <Bell aria-hidden="true" size={20} /> : <BellOff aria-hidden="true" size={20} />}
          </button>
          <button aria-label="Toggle fullscreen" className="icon-button" onClick={() => void handleFullscreen()} title="Fullscreen" type="button">
            <Expand aria-hidden="true" size={20} />
          </button>
          <button aria-label="Refresh live kitchen queue" className="icon-button" onClick={() => void refreshQueue()} title="Refresh queue" type="button">
            <RefreshCw aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <section className="status-strip" aria-label="Kitchen status">
        <div className="station-identity">
          <span className="station-icon"><ChefHat aria-hidden="true" size={22} /></span>
          <div><small>Active station</small><strong>Main Kitchen</strong></div>
        </div>
        <div className="summary-metrics">
          <div><strong>{counts.new}</strong><span>waiting</span></div>
          <div><strong>{counts.preparing}</strong><span>preparing</span></div>
          <div className={lateCount > 0 ? 'metric-late' : ''}><strong>{lateCount}</strong><span>running late</span></div>
        </div>
        <div className={`gateway-pill gateway-pill--${gatewayState}`}>
          {gatewayState === 'connected' ? <Wifi aria-hidden="true" size={17} /> : gatewayState === 'reconnecting' ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <WifiOff aria-hidden="true" size={17} />}
          <span><strong>{gatewayState === 'connected' ? 'Gateway connected' : gatewayState === 'reconnecting' ? 'Reconnecting' : 'Gateway offline'}</strong><small>{gatewayState === 'connected' ? 'Live kitchen updates' : 'Ticket actions are paused'}</small></span>
        </div>
      </section>

      {gatewayState !== 'connected' && (
        <div className="connection-banner" role="status">
          <WifiOff aria-hidden="true" size={19} />
          <span><strong>Outlet gateway is unavailable.</strong> Existing tickets remain visible, but preparation updates are paused.</span>
          <button onClick={() => void refreshQueue()} type="button"><RotateCcw aria-hidden="true" size={17} /> Reconnect</button>
        </div>
      )}

      <main className="board-shell">
        {loading ? (
          <div className="state-panel"><LoaderCircle className="spin" aria-hidden="true" size={32} /><strong>Loading kitchen queue…</strong><span>Connecting to the outlet service</span></div>
        ) : loadError ? (
          <div className="state-panel state-panel--error"><CircleAlert aria-hidden="true" size={32} /><strong>Queue unavailable</strong><span>{loadError}</span><button onClick={() => void refreshQueue()} type="button"><RefreshCw aria-hidden="true" size={18} /> Try again</button></div>
        ) : (
          <div className="ticket-board">
            {lanes.map((lane) => (
              <Lane
                description={lane.description}
                gatewayState={gatewayState}
                key={lane.status}
                label={lane.label}
                now={now}
                  onAdvance={(ticket) => void handleAdvance(ticket)}
                  onDelay={(ticket) => void handleDelay(ticket)}
                  onRemake={(ticket) => void handleRemake(ticket)}
                onToggleItem={(ticket, itemId, ready) => void handleToggleItem(ticket, itemId, ready)}
                pendingIds={pendingIds}
                pendingItemKeys={pendingItemKeys}
                status={lane.status}
                tickets={sortedTickets.filter((ticket) => ticket.status === lane.status)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer-bar">
        <span><MonitorUp aria-hidden="true" size={16} /> KDS-01 · Main Kitchen</span>
        <span>{isOutletGatewayConfigured ? 'Live outlet gateway queue · Cloud sync follows' : 'Outlet gateway is not configured · No fallback tickets are shown'}</span>
      </footer>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.tone}`} key={toast.id}>
            {toast.tone === 'success' ? <Check aria-hidden="true" size={19} /> : toast.tone === 'warning' ? <CircleAlert aria-hidden="true" size={19} /> : <Bell aria-hidden="true" size={19} />}
            <span>{toast.message}</span>
            <button aria-label="Dismiss message" onClick={() => setToasts((current) => current.filter((candidate) => candidate.id !== toast.id))} type="button"><X aria-hidden="true" size={17} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
