// Superadmin sales dashboard: who bought what, money in, money waiting,
// jerseys by colour, version and size, payment methods, and a live order feed.
// Route /sales (superadmin only).
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Download, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastContext'
import { Card, EmptyState, PageHeader } from '../components/UI'
import { db } from '../firebase'
import { mwk, STATUS_LABEL, type OrderStatus, type ShopOrder } from '../utils/shop'
import { logAction } from '../utils/audit'

const PAID: OrderStatus[] = ['paid', 'ready', 'collected']
const WAITING: OrderStatus[] = ['new', 'confirmed']
const PAY_LABEL: Record<string, string> = { airtel: 'Airtel Money', mpamba: 'TNM Mpamba', fdh: 'FDH Bank', cash: 'Cash' }
const JERSEY_COLOUR: Record<string, string> = { gold: '#C99A2E', white: '#E9E4D6', purple: '#5B21B6' }
const DAY = 86_400_000

const when = (o: ShopOrder) => (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : Date.now())
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Africa/Blantyre' })
const units = (o: ShopOrder) => (o.lines ?? []).reduce((n, l) => n + l.qty, 0)

function Bars({ rows, colourOf }: { rows: Array<{ label: string; value: number; sub?: string }>; colourOf?: (label: string) => string | undefined }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return <ul className="sd-bars">{rows.map((r) => <li key={r.label} title={`${r.label}: ${r.value}${r.sub ? ` · ${r.sub}` : ''}`}>
    <span className="sd-bar-label">{r.label}</span>
    <span className="sd-bar-track"><i style={{ width: `${(r.value / max) * 100}%`, background: colourOf?.(r.label) ?? 'var(--gold)' }} /></span>
    <b>{r.value}</b>{r.sub && <small>{r.sub}</small>}
  </li>)}</ul>
}

export default function SalesDashboard() {
  const { showToast } = useToast()
  const [orders, setOrders] = useState<ShopOrder[] | null>(null)
  const [range, setRange] = useState<7 | 30 | 0>(30)
  const [hover, setHover] = useState<number | null>(null)
  const [now] = useState(() => Date.now())
  const [showAll, setShowAll] = useState(false)

  useEffect(() => onSnapshot(collection(db, 'shopOrders'), (s) => setOrders(s.docs.map((d) => ({ ...(d.data() as ShopOrder), id: d.id })).sort((a, b) => when(b) - when(a))), () => setOrders([])), [])

  const inRange = useMemo(() => (orders ?? []).filter((o) => !range || when(o) >= now - range * DAY), [orders, range, now])
  const live = inRange.filter((o) => o.status !== 'cancelled')
  const paid = live.filter((o) => PAID.includes(o.status))
  const waiting = live.filter((o) => WAITING.includes(o.status))
  const money = paid.reduce((n, o) => n + o.total, 0)
  const fees = paid.reduce((n, o) => n + (Number((o.payment as { fee?: number } | undefined)?.fee) || 0), 0)
  const charged = money + fees
  const owed = waiting.reduce((n, o) => n + o.total, 0)
  const sold = live.reduce((n, o) => n + units(o), 0)
  const today = (orders ?? []).filter((o) => o.status !== 'cancelled' && dayKey(when(o)) === dayKey(now))

  // Sales per day (money of orders that were not cancelled).
  const days = range || 30
  const perDay = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const ms = now - (Math.min(days, 30) - 1 - i) * DAY
    const key = dayKey(ms)
    const list = live.filter((o) => dayKey(when(o)) === key)
    return { key, label: new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), money: list.reduce((n, o) => n + o.total, 0), count: list.length }
  })
  const maxDay = Math.max(1, ...perDay.map((d) => d.money))

  const count = (pick: (l: ShopOrder['lines'][number], o: ShopOrder) => string | undefined) => {
    const map = new Map<string, number>()
    for (const o of live) for (const l of (o.lines ?? [])) { const k = pick(l, o); if (k) map.set(k, (map.get(k) ?? 0) + l.qty) }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
  }
  const byProduct = (() => {
    const map = new Map<string, { qty: number; money: number }>()
    for (const o of live) for (const l of (o.lines ?? [])) { const name = l.name ?? 'Item'; const m = map.get(name) ?? { qty: 0, money: 0 }; const qty = Number(l.qty) || 0; m.qty += qty; m.money += ((Number(l.price) || 0) + (l.printPrice ?? 0)) * qty; map.set(name, m) }
    return [...map.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([label, v]) => ({ label, value: v.qty, sub: mwk(v.money) }))
  })()
  const byVersion = count((l) => l.variant)
  const bySize = count((l) => l.size || 'One size')
  const printed = count((l) => (l.printName || l.printNumber ? 'With name/number' : 'No printing'))
  const byPay = (() => {
    const map = new Map<string, number>()
    for (const o of live) { const k = PAY_LABEL[o.payment?.method ?? ''] ?? 'Not chosen'; map.set(k, (map.get(k) ?? 0) + o.total) }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  })()
  const payTotal = Math.max(1, byPay.reduce((n, [, v]) => n + v, 0))

  async function setStatus(o: ShopOrder, status: OrderStatus) {
    try { await updateDoc(doc(db, 'shopOrders', o.id), { status, updatedAt: serverTimestamp() }); void logAction(`Order ${STATUS_LABEL[status]}`, `${o.ref} · ${o.name} · MK ${o.total}`); showToast(`${o.ref}: ${STATUS_LABEL[status]}`) }
    catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') }
  }

  function exportCsv() {
    const rows = [['Order', 'Date', 'Fan', 'Phone', 'Items', 'Delivery', 'Payment', 'Transaction', 'Total (MK)', 'Status']]
    for (const o of inRange) rows.push([o.ref, new Date(when(o)).toLocaleString('en-GB'), o.name, o.phone, (o.lines ?? []).map((l) => `${l.qty}x ${l.name}${l.variant ? ` ${l.variant}` : ''}${l.size ? ` ${l.size}` : ''}${l.printName || l.printNumber ? ` print ${l.printName ?? ''} ${l.printNumber ?? ''}` : ''}`).join('; '), o.delivery === 'delivery' ? `Delivery: ${o.address ?? ''}` : 'Pick up', PAY_LABEL[o.payment?.method ?? ''] ?? '', o.payment?.txId ?? '', String(o.total), STATUS_LABEL[o.status] ?? o.status])
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `ekhaya-shop-orders-${dayKey(now)}.csv`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const colourOf = (label: string) => { const k = Object.keys(JERSEY_COLOUR).find((c) => (label ?? '').toLowerCase().includes(c)); return k ? JERSEY_COLOUR[k] : undefined }

  return <div className="sales-dash">
    <PageHeader eyebrow="Superadmin" title="Sales dashboard" description="Every shop order, live." action={<button type="button" className="sd-export" onClick={exportCsv} disabled={!inRange.length}><Download size={15} aria-hidden="true" /> Excel (CSV)</button>} />
    <div className="sd-range" role="tablist" aria-label="Period">{([[7, '7 days'], [30, '30 days'], [0, 'All time']] as const).map(([v, label]) => <button key={v} type="button" role="tab" aria-selected={range === v} className={range === v ? 'active' : ''} onClick={() => setRange(v)}>{label}</button>)}</div>

    {orders === null ? <p className="page-loading">Loading sales…</p> : !orders.length ? <Card><EmptyState icon={ShoppingBag} title="No orders yet" description="When a fan buys a jersey it shows here straight away, with a sound." /></Card> : <>
      <div className="sd-kpis">
        <div className="sd-kpi hero"><small>Money received</small><b>{mwk(money)}</b><span title={`Customers paid ${mwk(charged)} on PayChangu, including ${mwk(fees)} in fees`}>{paid.length} paid · {mwk(charged)} on PayChangu</span></div>
        <div className="sd-kpi"><small>PayChangu fees</small><b>{mwk(fees)}</b><span>charged {mwk(charged)}</span></div>
        <div className="sd-kpi"><small>Waiting for payment</small><b>{mwk(owed)}</b><span>{waiting.length} order{waiting.length === 1 ? '' : 's'}</span></div>
        <div className="sd-kpi"><small>Items sold</small><b>{sold}</b><span>{live.length} order{live.length === 1 ? '' : 's'}</span></div>
        <div className="sd-kpi"><small>Today</small><b>{today.length}</b><span>{mwk(today.reduce((n, o) => n + o.total, 0))}</span></div>
      </div>

      <Card className="sd-card">
        <h2>Sales per day <small>MK, all orders except cancelled</small></h2>
        <div className="sd-days" onMouseLeave={() => setHover(null)}>
          {perDay.map((d, i) => <button type="button" key={d.key} className={`sd-day ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} aria-label={`${d.label}: ${mwk(d.money)}, ${d.count} orders`}>
            <i style={{ height: `${d.money ? Math.max(4, (d.money / maxDay) * 100) : 0}%` }} />
          </button>)}
          {hover != null && <div className="sd-tip" style={{ left: `${Math.min(80, Math.max(20, ((hover + 0.5) / perDay.length) * 100))}%` }}><b>{perDay[hover].label}</b>{mwk(perDay[hover].money)} · {perDay[hover].count} order{perDay[hover].count === 1 ? '' : 's'}</div>}
        </div>
        <div className="sd-axis"><span>{perDay[0]?.label}</span><span>Top day {mwk(maxDay === 1 ? 0 : maxDay)}</span><span>{perDay[perDay.length - 1]?.label}</span></div>
      </Card>

      <div className="sd-grid">
        <Card className="sd-card"><h2>Jerseys</h2>{byProduct.length ? <Bars rows={byProduct} colourOf={colourOf} /> : <p className="live-help">No sales in this period.</p>}</Card>
        <Card className="sd-card"><h2>Version</h2>{byVersion.length ? <Bars rows={byVersion} /> : <p className="live-help">—</p>}<h2 className="sd-h2-gap">Printing</h2>{printed.length ? <Bars rows={printed} /> : <p className="live-help">—</p>}</Card>
        <Card className="sd-card"><h2>Sizes</h2>{bySize.length ? <Bars rows={bySize} /> : <p className="live-help">—</p>}</Card>
        <Card className="sd-card"><h2>Payment</h2>
          <div className="sd-split">{byPay.map(([k, v]) => <i key={k} className={`p-${k.split(' ')[0].toLowerCase()}`} style={{ flexGrow: v }} title={`${k}: ${mwk(v)}`} />)}</div>
          <ul className="sd-legend">{byPay.map(([k, v]) => <li key={k}><i className={`p-${k.split(' ')[0].toLowerCase()}`} />{k}<b>{mwk(v)}</b><small>{Math.round((v / payTotal) * 100)}%</small></li>)}</ul>
        </Card>
      </div>

      <Card className="sd-card">
        <h2>Latest orders <small>live</small></h2>
        <ul className="sd-feed">{inRange.slice(0, showAll ? 300 : 12).map((o) => <li key={o.id} className={`s-${o.status}`}>
          <div className="sd-feed-top"><strong>{o.name}</strong><b>{mwk(o.total)}</b></div>
          <p>{(o.lines ?? []).map((l) => `${l.qty} × ${l.name}${l.variant ? `, ${l.variant}` : ''}${l.size ? ` (${l.size})` : ''}${l.printName || l.printNumber ? ` · ${l.printName ?? ''} ${l.printNumber ?? ''}` : ''}`).join(' · ')}</p>
          <div className="sd-feed-meta">
            <span>{o.ref}</span><span>{new Date(when(o)).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span>{PAY_LABEL[o.payment?.method ?? ''] ?? 'No payment chosen'}{o.payment?.txId ? ` · ${o.payment.txId}` : ''}</span>
            <a href={`tel:${o.phone}`}>{o.phone}</a>
          </div>
          <div className="sd-feed-actions">
            <span className={`shop-status s-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
            {WAITING.includes(o.status) && <button type="button" className="shop-paid-btn" onClick={() => void setStatus(o, 'paid')}>✓ Mark paid</button>}
            {o.status === 'paid' && <button type="button" className="shop-paid-btn" onClick={() => void setStatus(o, 'ready')}>✓ Ready</button>}
            {o.status === 'ready' && <button type="button" className="shop-paid-btn" onClick={() => void setStatus(o, 'collected')}>✓ Collected</button>}
          </div>
        </li>)}</ul>
        {!showAll && inRange.length > 12 && <button type="button" className="sd-more" onClick={() => setShowAll(true)}>Show all {inRange.length} orders</button>}
        <Link className="shop-link" to="/admin?section=shop">All orders and products in Admin → Shop</Link>
      </Card>
    </>}
  </div>
}
