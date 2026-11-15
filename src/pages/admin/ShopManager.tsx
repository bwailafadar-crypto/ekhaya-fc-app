// Admin → Shop: products (photos, price, sizes, printing), shop settings
// (WhatsApp number, printing and delivery prices, banner) and fans' orders.
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { ImagePlus, Package, Pencil, Plus, ScanLine, Settings, ShoppingBag, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import OrderCollect from './OrderCollect'
import { useAuth } from '../../auth/AuthContext'
import ShirtArt from '../../components/ShirtArt'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import { useShopSettings } from '../../hooks/useShopSettings'
import { compressImage } from '../../utils/compressImage'
import {
  ADULT_SIZES, CATEGORIES, isPublished, KIDS_SIZES, mwk, ORDER_STATUSES, STARTER_PRODUCTS, STATUS_LABEL, waLink,
  type OrderStatus, type ShopOrder, type ShopProduct, type ShopSettings,
} from '../../utils/shop'
import { logAction } from '../../utils/audit'
import { confirmIdentity } from '../../utils/reauth'

const PRODUCT_IMAGE = { maxDimension: 720, maxBytes: 110 * 1024 }
const BANNER_IMAGE = { maxDimension: 1080, maxBytes: 160 * 1024 }
const LOGO_IMAGE = { maxDimension: 256, maxBytes: 30 * 1024, keepTransparency: true }
const blank: Omit<ShopProduct, 'id'> = { name: '', category: 'kits', price: 0, sizes: [...ADULT_SIZES], images: [], personalisable: true, active: false, badge: '', colour: 'home', order: 10, description: '' }

export default function ShopManager() {
  const { showToast } = useToast()
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [tab, setTab] = useState<'orders' | 'products' | 'collect' | 'settings'>('orders')
  const [editing, setEditing] = useState<(Omit<ShopProduct, 'id'> & { id?: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const { user } = useAuth()

  useEffect(() => onSnapshot(collection(db, 'shopProducts'), (s) => setProducts(s.docs.map((d) => ({ ...(d.data() as ShopProduct), id: d.id })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))), () => setProducts([])), [])
  useEffect(() => onSnapshot(collection(db, 'shopOrders'), (s) => setOrders(s.docs.map((d) => ({ ...(d.data() as ShopOrder), id: d.id })).sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity))), () => setOrders([])), [])
  const open = orders.filter((o) => o.status !== 'collected' && o.status !== 'cancelled')

  async function addStarters() {
    setBusy(true)
    try {
      const batch = writeBatch(db)
      STARTER_PRODUCTS.forEach((p) => batch.set(doc(collection(db, 'shopProducts')), { ...p, images: [], active: false, createdAt: serverTimestamp() }))
      await batch.commit()
      showToast('6 starter items added (hidden). Give each a price and photo, then switch it on.')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') } finally { setBusy(false) }
  }

  async function remove(p: ShopProduct) {
    if (!window.confirm(`Delete ${p.name} from the shop?`)) return
    try { await deleteDoc(doc(db, 'shopProducts', p.id)); void logAction('Deleted a shop product', p.name); showToast('Deleted.') } catch (e) { showToast(e instanceof Error ? e.message : 'Not deleted.', 'error') }
  }

  async function toggle(p: ShopProduct) {
    if (!p.active && !(p.price > 0)) { showToast('Give it a price first.', 'error'); setEditing(p); return }
    try { await updateDoc(doc(db, 'shopProducts', p.id), { active: !p.active }); void logAction(p.active ? 'Took a product off sale' : 'Put a product on sale', p.name) } catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') }
  }

  async function setStatus(o: ShopOrder, status: OrderStatus) {
    try { await updateDoc(doc(db, 'shopOrders', o.id), { status, updatedAt: serverTimestamp() }); void logAction(`Order ${STATUS_LABEL[status]}`, `${o.ref} · ${o.name} · MK ${o.total}`) } catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') }
  }

  async function handOver(o: ShopOrder) {
    if (!window.confirm(`Hand over ${o.ref} to ${o.name}? This marks it collected and the code can't be used again.`)) return
    try {
      await updateDoc(doc(db, 'shopOrders', o.id), { status: 'collected', collectedAt: serverTimestamp(), collectedBy: user?.uid ?? '', updatedAt: serverTimestamp() })
      void logAction('Order collected', `${o.ref} · ${o.name} · MK ${o.total}`)
      showToast(`${o.ref} handed over to ${o.name}.`)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') }
  }

  const query = search.trim().toLowerCase()
  const shownOrders = query ? orders.filter((o) => `${o.ref} ${o.name} ${o.phone}`.toLowerCase().includes(query)) : orders

  return <Card className="admin-card shop-admin">
    <div className="fz-card-heading"><ShoppingBag size={18} aria-hidden="true" /><div><h2>Club shop</h2><span>{products.filter(isPublished).length} on sale · {open.length} open order{open.length === 1 ? '' : 's'}</span></div></div>
    <div className="shop-print-tabs">
      <button type="button" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><Package size={14} /> Products</button>
      <button type="button" className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ShoppingBag size={14} /> Orders{open.length ? ` (${open.length})` : ''}</button>
      <button type="button" className={tab === 'collect' ? 'active' : ''} onClick={() => setTab('collect')}><ScanLine size={14} /> Collect</button>
      <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={14} /> Settings</button>
    </div>

    {tab === 'products' && (editing ? <ProductForm value={editing} onDone={() => setEditing(null)} /> : <>
      <div className="admin-actions">
        <Button type="button" icon={<Plus size={16} />} onClick={() => setEditing({ ...blank, order: products.length + 1 })}>Add product</Button>
        {!products.length && <Button type="button" variant="secondary" disabled={busy} onClick={() => void addStarters()}>Add starter items (kits, scarf, cap…)</Button>}
      </div>
      {!products.length && <p className="live-help">No products yet. Starter items come hidden with no price: add a price and a photo, then switch each one on.</p>}
      <ul className="shop-admin-list">{products.map((p) => <li key={p.id} className={isPublished(p) ? '' : 'off'}>
        <div className="shop-line-pic">{p.images?.[0] ? <img className="shop-img" src={p.images[0]} alt="" /> : <ShirtArt colour={p.colour} />}</div>
        <div className="shop-line-info"><strong>{p.name}</strong><small>{p.price > 0 ? mwk(p.price) : 'No price yet'} · {CATEGORIES.find((c) => c.key === p.category)?.label}{p.soldOut ? ' · sold out' : ''}{p.featured ? ' · in the shop window' : ''}</small></div>
        <label className="shop-switch" title={isPublished(p) ? 'On sale' : 'Hidden'}><input type="checkbox" checked={isPublished(p)} onChange={() => void toggle(p)} /><span>{isPublished(p) ? 'On sale' : 'Hidden'}</span></label>
        <button type="button" className="shop-icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil size={16} /></button>
        <button type="button" className="shop-icon-btn" onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}><Trash2 size={16} /></button>
      </li>)}</ul>
    </>)}

    {tab === 'orders' && (!orders.length ? <p className="live-help">No orders yet. When a fan orders, it shows here (and on WhatsApp if you set the number in Settings).</p>
      : <>
        <input className="shop-order-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Match a code the fan brings, e.g. EK-7K#M9Q (or name)" aria-label="Find order by code or name" />
        {query && !shownOrders.length
          ? <p className="shop-order-nomatch">⛔ No order matches “{search.trim()}”. Do not hand over a product for this code.</p>
          : <ul className="shop-admin-orders">{shownOrders.map((o) => { const payable = o.status === 'paid' || o.status === 'ready'; return <li key={o.id} className={`s-${o.status}`}>
        <div className="shop-order-top"><code className="shop-order-code">{o.ref}</code><span>{o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'just now'}</span><b>{mwk(o.total)}</b></div>
        <p>{o.name} · <a href={`tel:${o.phone}`}>{o.phone}</a> · {o.delivery === 'delivery' ? `Deliver: ${o.address ?? ''}` : 'Pick up'} · <span className={`shop-status s-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span></p>
        <ul>{o.lines.map((l, i) => <li key={i}>{l.qty} × {l.name}{l.variant ? <b>, {l.variant}</b> : null}{l.size ? ` (${l.size})` : ''}{l.printName || l.printNumber ? <em> print {l.printName} {l.printNumber}</em> : null}</li>)}</ul>
        <p className="shop-order-pay">{o.payment ? <>Payment: <b>{o.payment.method === 'airtel' ? 'Airtel Money' : o.payment.method === 'mpamba' ? 'TNM Mpamba' : o.payment.method === 'fdh' ? 'FDH Bank' : 'Cash'}</b>{o.payment.txId ? <> · transaction <b>{o.payment.txId}</b></> : o.payment.method !== 'cash' ? ' · no transaction ID yet' : ''}</> : 'Payment: not chosen'}</p>
        {o.status === 'collected' && <p className="shop-order-collected">✓ Collected{o.collectedAt?.seconds ? ` on ${new Date(o.collectedAt.seconds * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''} — this code can't be used again.</p>}
        <div className="shop-order-actions">
          {(o.status === 'new' || o.status === 'confirmed') && <button type="button" className="shop-paid-btn" onClick={() => void setStatus(o, 'paid')}>✓ Mark paid</button>}
          {payable && <button type="button" className="shop-collect-btn" onClick={() => void handOver(o)}>✓ Hand over &amp; mark collected</button>}
          <select value={o.status} onChange={(e) => void setStatus(o, e.target.value as OrderStatus)} aria-label="Order status">{ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <a className="shop-wa" href={waLink(o.phone, `Hello ${o.name}, about your Ekhaya FC shop order ${o.ref} (${mwk(o.total)}): `)} target="_blank" rel="noopener noreferrer">WhatsApp the fan</a>
        </div>
      </li> })}</ul>}
      </>)}

    {tab === 'collect' && <OrderCollect />}
    {tab === 'settings' && <SettingsForm />}
  </Card>
}

function ProductForm({ value, onDone }: { value: Omit<ShopProduct, 'id'> & { id?: string }; onDone: () => void }) {
  const { showToast } = useToast()
  const [p, setP] = useState(value)
  const [busy, setBusy] = useState(false)
  const [versionsText, setVersionsText] = useState((value.variants ?? []).map((v) => [v.label, v.price, v.note].filter((x) => x !== undefined && x !== '').join(' = ')).join('\n'))
  const set = <K extends keyof ShopProduct>(k: K, v: ShopProduct[K]) => setP((old) => ({ ...old, [k]: v }))
  const sizes = p.sizes ?? []
  const toggleSize = (s: string) => set('sizes', sizes.includes(s) ? sizes.filter((x) => x !== s) : [...ADULT_SIZES, ...KIDS_SIZES].filter((x) => x === s || sizes.includes(x)))
  const toggleSoldOut = (s: string) => set('soldOutSizes', (p.soldOutSizes ?? []).includes(s) ? (p.soldOutSizes ?? []).filter((x) => x !== s) : [...(p.soldOutSizes ?? []), s])

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    try {
      const fresh = await Promise.all([...files].slice(0, 4 - (p.images?.length ?? 0)).map((f) => compressImage(f, PRODUCT_IMAGE)))
      set('images', [...(p.images ?? []), ...fresh].slice(0, 4))
    } catch (e) { showToast(e instanceof Error ? e.message : 'Photo not added.', 'error') }
  }

  async function save() {
    if (p.name.trim().length < 2) { showToast('Give the product a name.', 'error'); return }
    if (p.active && !(p.price > 0)) { showToast('A product on sale needs a price.', 'error'); return }
    setBusy(true)
    const variants = versionsText.split('\n').map((line) => line.split('=').map((x) => x.trim())).filter(([label, price]) => label && Number(price.replace(/\D/g, '')) > 0).map(([label, price, note]) => ({ label, price: Number(price.replace(/\D/g, '')), ...(note ? { note } : {}) }))
    const { id, ...data } = p
    const clean = { ...data, variants, group: p.group ?? null, name: p.name.trim(), price: variants.length ? Math.min(...variants.map((v) => v.price)) : Number(p.price) || 0, oldPrice: Number(p.oldPrice) || null, updatedAt: serverTimestamp() }
    try {
      if (id) await setDoc(doc(db, 'shopProducts', id), clean)
      else await addDoc(collection(db, 'shopProducts'), { ...clean, createdAt: serverTimestamp() })
      void logAction(id ? 'Edited a shop product' : 'Added a shop product', `${clean.name}: MK ${clean.price}${variants.length ? ` (${variants.map((x) => `${x.label} ${x.price}`).join(', ')})` : ''}`)
      showToast(p.active ? `${p.name} is on sale.` : `${p.name} saved (hidden).`)
      onDone()
    } catch (e) { showToast(e instanceof Error ? `Not saved: ${e.message}` : 'Not saved.', 'error') } finally { setBusy(false) }
  }

  return <div className="shop-form">
    <h3>{p.id ? `Edit ${value.name}` : 'New product'}</h3>
    <div className="shop-form-photos">
      {(p.images ?? []).map((src, i) => <div key={i} className="shop-form-photo"><img src={src} alt="" /><button type="button" onClick={() => set('images', (p.images ?? []).filter((_, j) => j !== i))} aria-label="Remove photo">×</button>{i === 0 && <small>Main</small>}</div>)}
      {(p.images?.length ?? 0) < 4 && <label className="shop-form-add"><input type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(e.currentTarget.files); e.currentTarget.value = '' }} /><ImagePlus size={20} /><span>Add photo</span></label>}
    </div>
    {!p.images?.length && <p className="live-help">No photo: fans see a drawn shirt in the colours below. Up to 4 photos (front, back, details).</p>}
    <div className="admin-form-grid">
      <label className="admin-field"><span>Name</span><input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Home Kit 2026" /></label>
      <label className="admin-field"><span>Category</span><select value={p.category} onChange={(e) => set('category', e.target.value as ShopProduct['category'])}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <label className="admin-field"><span>Price (MK)</span><input inputMode="numeric" value={p.price || ''} onChange={(e) => set('price', Number(e.target.value.replace(/\D/g, '')))} placeholder="25000" /></label>
      <label className="admin-field"><span>Old price (for a sale, optional)</span><input inputMode="numeric" value={p.oldPrice || ''} onChange={(e) => set('oldPrice', Number(e.target.value.replace(/\D/g, '')) || null)} /></label>
      <label className="admin-field"><span>Label</span><select value={p.badge ?? ''} onChange={(e) => set('badge', e.target.value as ShopProduct['badge'])}><option value="">None</option><option>New</option><option>Bestseller</option><option>Limited</option><option>Sale</option></select></label>
      <label className="admin-field"><span>Shirt colours (no photo)</span><select value={p.colour ?? 'home'} onChange={(e) => set('colour', e.target.value as ShopProduct['colour'])}><option value="home">Gold (home)</option><option value="away">Black (away)</option><option value="third">White</option><option value="training">Dark (training)</option></select></label>
      <label className="admin-field"><span>Order in the shop (1 = first)</span><input inputMode="numeric" value={p.order ?? ''} onChange={(e) => set('order', Number(e.target.value.replace(/\D/g, '')) || 99)} /></label>
    </div>
    <label className="admin-field"><span>Description</span><textarea rows={3} value={p.description ?? ''} maxLength={600} onChange={(e) => set('description', e.target.value)} /></label>
    <label className="admin-field"><span>Versions with their own price (one per line: name = price = short note). Leave empty for one price.</span><textarea rows={2} value={versionsText} onChange={(e) => setVersionsText(e.target.value)} placeholder={'Fan version = 50000 = Supporters’ shirt\nPlayer version = 75000 = Match shirt, as worn by the players'} /></label>
    <label className="admin-field"><span>Colour group (same word on each colour of one shirt shows colour circles)</span><input value={p.group ?? ''} onChange={(e) => set('group', e.target.value.trim() || undefined)} placeholder="jersey-2026" /></label>
    <div className="shop-block"><strong>Sizes</strong> <small className="live-help">(none = one size, like a scarf)</small>
      <div className="shop-sizes">{[...ADULT_SIZES, ...KIDS_SIZES].map((s) => <button type="button" key={s} className={sizes.includes(s) ? 'active' : ''} onClick={() => toggleSize(s)}>{s}</button>)}</div>
      {sizes.length > 0 && <><small className="live-help">Sold out sizes (tap):</small><div className="shop-sizes">{sizes.map((s) => <button type="button" key={s} className={(p.soldOutSizes ?? []).includes(s) ? 'soldout' : ''} onClick={() => toggleSoldOut(s)}>{s}</button>)}</div></>}
    </div>
    <div className="shop-checks">
      <label><input type="checkbox" checked={Boolean(p.personalisable)} onChange={(e) => set('personalisable', e.target.checked)} /> Name & number printing</label>
      <label><input type="checkbox" checked={Boolean(p.featured)} onChange={(e) => set('featured', e.target.checked)} /> Show in the shop window (top banner)</label>
      <label><input type="checkbox" checked={Boolean(p.soldOut)} onChange={(e) => set('soldOut', e.target.checked)} /> Sold out</label>
      <label><input type="checkbox" checked={Boolean(p.active)} onChange={(e) => set('active', e.target.checked)} /> <b>On sale (fans can see it)</b></label>
    </div>
    <div className="admin-actions"><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button></div>
  </div>
}

function SettingsForm() {
  const { showToast } = useToast()
  const current = useShopSettings()
  const [s, setS] = useState<ShopSettings | null>(null)
  const v = s ?? current
  const set = <K extends keyof ShopSettings>(k: K, val: ShopSettings[K]) => setS({ ...v, [k]: val })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!(await confirmIdentity('Shop settings include the numbers fans pay to.'))) return
    setBusy(true)
    const changed = (Object.keys(v) as Array<keyof ShopSettings>).filter((k) => typeof v[k] !== 'object' && String(v[k] ?? '') !== String(current[k] ?? '') && !/Logo|bannerImage/.test(k))
    try { await setDoc(doc(db, 'shopSettings', 'main'), { ...v, updatedAt: serverTimestamp() }, { merge: true }); void logAction('Changed shop settings', changed.map((k) => `${k}: ${String(current[k] ?? '–').slice(0, 30)} → ${String(v[k] ?? '–').slice(0, 30)}`).join(' · ') || 'saved'); showToast('Shop settings saved.'); setS(null) }
    catch (e) { showToast(e instanceof Error ? `Not saved: ${e.message}` : 'Not saved.', 'error') } finally { setBusy(false) }
  }

  return <div className="shop-form">
    <div className="admin-form-grid">
      <label className="admin-field"><span>Club WhatsApp number (orders go here)</span><input value={v.whatsapp ?? ''} inputMode="tel" onChange={(e) => set('whatsapp', e.target.value)} placeholder="0991 234 567" /></label>
      <label className="admin-field"><span>Name & number printing (MK)</span><input inputMode="numeric" value={v.printPrice ?? ''} onChange={(e) => set('printPrice', Number(e.target.value.replace(/\D/g, '')))} /></label>
      <label className="admin-field"><span>Delivery price (MK)</span><input inputMode="numeric" value={v.deliveryPrice ?? ''} onChange={(e) => set('deliveryPrice', Number(e.target.value.replace(/\D/g, '')))} /></label>
      <label className="admin-field"><span>Free delivery from (MK)</span><input inputMode="numeric" value={v.freeDeliveryFrom ?? ''} onChange={(e) => set('freeDeliveryFrom', Number(e.target.value.replace(/\D/g, '')))} /></label>
      <label className="admin-field"><span>Airtel Money number (fans pay here)</span><input value={v.airtelNumber ?? ''} inputMode="tel" onChange={(e) => set('airtelNumber', e.target.value)} placeholder="099…" /></label>
      <label className="admin-field"><span>TNM Mpamba number (fans pay here)</span><input value={v.mpambaNumber ?? ''} inputMode="tel" onChange={(e) => set('mpambaNumber', e.target.value)} placeholder="088…" /></label>
      <label className="admin-field"><span>PayChangu payment server address (for PIN payments)</span><input value={v.payApi ?? ''} inputMode="url" onChange={(e) => set('payApi', e.target.value.trim())} placeholder="https://ekhaya-pay.netlify.app" /></label>
      <label className="admin-field"><span>FDH Bank account number</span><input value={v.fdhAccount ?? ''} inputMode="numeric" onChange={(e) => set('fdhAccount', e.target.value)} /></label>
      <label className="admin-field"><span>FDH account name</span><input value={v.fdhAccountName ?? ''} onChange={(e) => set('fdhAccountName', e.target.value)} placeholder="Ekhaya Football Club" /></label>
      <label className="admin-field"><span>FDH branch</span><input value={v.fdhBranch ?? ''} onChange={(e) => set('fdhBranch', e.target.value)} placeholder="Blantyre" /></label>
      <label className="admin-field"><span>Name on the money account</span><input value={v.payName ?? ''} onChange={(e) => set('payName', e.target.value)} placeholder="Ekhaya FC" /></label>
      <div className="admin-field shop-logo-fields"><span>Payment logos (official images from Airtel, TNM and FDH Bank, shown at checkout)</span>
        <div className="shop-form-photos">{([['airtelLogo', 'Airtel Money'], ['mpambaLogo', 'TNM Mpamba'], ['fdhLogo', 'FDH Bank']] as const).map(([key, label]) => <div key={key} className="shop-logo-slot">
          {v[key] ? <div className="shop-form-photo logo"><img src={v[key]} alt={label} /><button type="button" onClick={() => set(key, '')} aria-label={`Remove ${label} logo`}>×</button></div>
            : <label className="shop-form-add"><input type="file" accept="image/*" onChange={async (e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) { try { set(key, await compressImage(f, LOGO_IMAGE)) } catch (err) { showToast(err instanceof Error ? err.message : 'Not added.', 'error') } } }} /><ImagePlus size={20} /><span>{label}</span></label>}
          <small>{label}</small>
        </div>)}</div>
      </div>
      <label className="admin-field"><span>Pick up place</span><input value={v.pickupPlace ?? ''} onChange={(e) => set('pickupPlace', e.target.value)} /></label>
      <label className="admin-field"><span>Shop window title</span><input value={v.bannerTitle ?? ''} maxLength={40} onChange={(e) => set('bannerTitle', e.target.value)} /></label>
    </div>
    <label className="admin-field"><span>Shop window text</span><input value={v.bannerText ?? ''} maxLength={90} onChange={(e) => set('bannerText', e.target.value)} /></label>
    <label className="admin-field"><span>Payment note</span><textarea rows={2} value={v.paymentNote ?? ''} maxLength={200} onChange={(e) => set('paymentNote', e.target.value)} /></label>
    <div className="shop-form-photos">
      {v.bannerImage && <div className="shop-form-photo wide"><img src={v.bannerImage} alt="" /><button type="button" onClick={() => set('bannerImage', '')} aria-label="Remove banner">×</button></div>}
      <label className="shop-form-add"><input type="file" accept="image/*" onChange={async (e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) { try { set('bannerImage', await compressImage(f, BANNER_IMAGE)) } catch (err) { showToast(err instanceof Error ? err.message : 'Not added.', 'error') } } }} /><ImagePlus size={20} /><span>{v.bannerImage ? 'Change' : 'Shop window photo'}</span></label>
    </div>
    <div className="admin-actions"><Button type="button" disabled={busy || !s} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</Button></div>
  </div>
}
