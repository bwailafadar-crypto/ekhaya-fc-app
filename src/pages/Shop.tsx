// Club shop, built the way big club stores work: a shop window, categories,
// product pages with sizes and a size guide, name & number printing (pick a
// player or your own name), wishlist, a cart and an order that goes to the
// club on WhatsApp. /shop and /shop/:id
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { ArrowLeft, Heart, Minus, Package, Plus, Ruler, ShoppingBag, Shirt, Truck, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ShirtArt from '../components/ShirtArt'
import { useToast } from '../components/ToastContext'
import { Button, EmptyState } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useShopSettings } from '../hooks/useShopSettings'
import { useFlag } from '../hooks/useFlag'
import type { Player } from '../types'
import {
  addToCart, CATEGORIES, fromPrice, newOrderRef, orderLine, clearCart, isPublished, lineTotal, mwk, orderText, setQty, settingsWithDefaults, SIZE_GUIDE, STATUS_LABEL, toggleWish, useShopStore, waLink,
  type OrderStatus, type ShopCategory, type ShopOrder, type ShopProduct,
} from '../utils/shop'

type Sort = 'featured' | 'new' | 'low' | 'high'

/** Bottom sheet drawn above the menu bar and banners. */
function Sheet({ label, onClose, wide = false, children }: { label: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return createPortal(<div className="shop-sheet-wrap" onClick={onClose}><div className={`shop-sheet${wide ? ' shop-cart' : ''}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>{children}</div></div>, document.body)
}

function ProductPicture({ product, className = '' }: { product: Pick<ShopProduct, 'images' | 'colour' | 'name' | 'category'>; className?: string }) {
  const image = product.images?.[0]
  if (image) return <img className={`shop-img ${className}`} src={image} alt={product.name} loading="lazy" />
  if (product.category === 'kits' || product.category === 'training' || product.category === 'fanwear') return <ShirtArt colour={product.colour} className={className} />
  return <div className={`shop-img shop-img-crest ${className}`}><img src="./team-logos/ekhaya-fc.png" alt="" /></div>
}

function Price({ product, exact }: { product: ShopProduct; exact?: number }) {
  const many = !exact && (product.variants?.length ?? 0) > 1
  const price = exact ?? fromPrice(product)
  return <span className="shop-price">{product.oldPrice && product.oldPrice > price && <s>{mwk(product.oldPrice)}</s>}{many && <small>From</small>}<b>{mwk(price)}</b></span>
}

export default function Shop() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { role } = useAuth()
  const isStaff = role === 'admin' || role === 'superadmin'
  const all = useFirestoreCollection<Omit<ShopProduct, 'id'>>('shopProducts')
  const products = useMemo(() => (all.items as ShopProduct[]).filter(isPublished).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name)), [all.items])
  const settings = useShopSettings()
  const { cart, wish } = useShopStore()
  const [category, setCategory] = useState<ShopCategory | 'all' | 'wish'>('all')
  const [sort, setSort] = useState<Sort>('featured')
  const shopOpen = useFlag('clubShop') || isStaff
  const cartOpen = params.get('cart') === '1'
  const ordersOpen = params.get('orders') === '1'
  const openPanel = (name: 'cart' | 'orders' | null) => setParams(name ? { [name]: '1' } : {}, { replace: false })
  const count = cart.reduce((n, l) => n + l.qty, 0)

  const product = id ? products.find((p) => p.id === id) ?? (all.items as ShopProduct[]).find((p) => p.id === id && isStaff) : undefined
  const hero = products.find((p) => p.featured) ?? products[0]

  const shown = useMemo(() => {
    const list = products.filter((p) => category === 'all' || (category === 'wish' ? wish.includes(p.id) : p.category === category))
    if (sort === 'low') return [...list].sort((a, b) => a.price - b.price)
    if (sort === 'high') return [...list].sort((a, b) => b.price - a.price)
    if (sort === 'new') return [...list].sort((a, b) => Number(b.badge === 'New') - Number(a.badge === 'New'))
    return list
  }, [products, category, sort, wish])

  const bar = <div className="shop-bar">
    {id ? <Link to="/shop" className="shop-back"><ArrowLeft size={18} aria-hidden="true" /> Shop</Link> : <h1 className="shop-title">Club Shop</h1>}
    <button type="button" className="shop-icon-btn" onClick={() => openPanel('orders')} aria-label="My orders"><Package size={19} /></button>
    <button type="button" className="shop-icon-btn shop-cart-btn" onClick={() => openPanel('cart')} aria-label={`Cart, ${count} items`}><ShoppingBag size={19} />{count > 0 && <span className="shop-count">{count}</span>}</button>
  </div>

  const panels = <>
    {cartOpen && <CartPanel key={params.get('step') ?? 'cart'} settings={settings} products={products} startStep={params.get('step') === 'details' ? 'details' : 'cart'} onClose={() => openPanel(null)} onOrders={() => openPanel('orders')} />}
    {ordersOpen && <OrdersPanel onClose={() => openPanel(null)} />}
  </>

  if (!shopOpen) return <div className="shop"><h1 className="shop-title">Club Shop</h1><EmptyState icon={ShoppingBag} title="Coming soon" description="The Ekhaya shop is closed for now. Check back soon." /></div>

  if (all.loading) return <div className="shop">{bar}<p className="page-loading">Loading the shop…</p></div>

  if (id) return <div className="shop">{bar}{product ? <ProductPage key={product.id} product={product} siblings={product.group ? products.filter((p) => p.group === product.group) : []} settings={settings} onAdded={(buy) => setParams(buy ? { cart: '1', step: 'details' } : { cart: '1' })} /> : <EmptyState icon={Shirt} title="Not in the shop" description="This item was sold out or taken off the shop." />}{panels}</div>

  if (!products.length) return <div className="shop">{bar}
    <section className="shop-hero shop-hero-soon"><ShirtArt colour="home" className="shop-hero-shirt" /><div><small>Ekhaya FC</small><h2>The shop opens soon</h2><p>Kits, training wear, scarves and caps, with your name and number printed.</p></div></section>
    {isStaff && <p className="shop-staff-note">Admin: add products in <Link to="/admin?section=shop">Admin → Shop</Link>. Fans see them as soon as you give a price and switch them on.</p>}
    {panels}
  </div>

  return <div className="shop">
    {bar}
    {hero && (settings.bannerImage
      ? <Link to={`/shop/${hero.id}`} className="shop-banner">
        <img src={settings.bannerImage} alt={settings.bannerTitle} />
        <div className="shop-banner-text"><small>Ekhaya FC · Official</small><h2>{settings.bannerTitle}</h2><p>{settings.bannerText}</p><span className="shop-hero-cta">Shop now · from {mwk(fromPrice(hero))}</span></div>
      </Link>
      : <Link to={`/shop/${hero.id}`} className="shop-hero">
        <ProductPicture product={hero} className="shop-hero-shirt" />
        <div><small>{hero.badge || 'Ekhaya FC'}</small><h2>{settings.bannerTitle}</h2><p>{settings.bannerText}</p><span className="shop-hero-cta">Shop now · from {mwk(fromPrice(hero))}</span></div>
      </Link>)}

    <div className="shop-perks">
      <span><Shirt size={15} aria-hidden="true" /> Name & number printing</span>
      <span><Truck size={15} aria-hidden="true" /> Free delivery from {mwk(settings.freeDeliveryFrom)}</span>
      <span><Package size={15} aria-hidden="true" /> Pick up at {settings.pickupPlace}</span>
    </div>

    <div className="shop-chips" role="tablist" aria-label="Categories">
      {[{ key: 'all' as const, label: 'All' }, ...CATEGORIES.filter((c) => products.some((p) => p.category === c.key)), ...(wish.length ? [{ key: 'wish' as const, label: `♥ Saved (${wish.length})` }] : [])].map((c) =>
        <button key={c.key} type="button" role="tab" aria-selected={category === c.key} className={category === c.key ? 'active' : ''} onClick={() => setCategory(c.key)}>{c.label}</button>)}
    </div>
    <div className="shop-sort"><span>{shown.length} item{shown.length === 1 ? '' : 's'}</span>
      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort"><option value="featured">Featured</option><option value="new">New in</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
    </div>

    <div className="shop-grid">
      {shown.map((p) => <div className="shop-card" key={p.id}>
        <Link to={`/shop/${p.id}`} className="shop-card-pic">
          <ProductPicture product={p} />
          {p.soldOut ? <span className="shop-badge sold">Sold out</span> : p.badge ? <span className={`shop-badge b-${p.badge.toLowerCase()}`}>{p.badge}</span> : null}
        </Link>
        <button type="button" className={`shop-wish ${wish.includes(p.id) ? 'on' : ''}`} onClick={() => toggleWish(p.id)} aria-label={wish.includes(p.id) ? 'Remove from saved' : 'Save'} aria-pressed={wish.includes(p.id)}><Heart size={16} /></button>
        <Link to={`/shop/${p.id}`} className="shop-card-body">
          <strong>{p.name}</strong>
          {p.personalisable && <small>Add name & number</small>}
          <Price product={p} />
        </Link>
      </div>)}
    </div>
    {category === 'wish' && !shown.length && <EmptyState icon={Heart} title="Nothing saved" description="Tap the heart on an item to keep it here." />}
    <div className="shop-accept"><span>We accept</span>{(['airtel', 'mpamba', 'cash'] as PayMethod[]).map((m) => <PayIcon key={m} method={m} settings={settings} />)}</div>
    <p className="shop-pay-note">{settings.paymentNote}</p>
    {panels}
  </div>
}

function ProductPage({ product, siblings, settings, onAdded }: { product: ShopProduct; siblings: ShopProduct[]; settings: ReturnType<typeof settingsWithDefaults>; onAdded: (buy: boolean) => void }) {
  const { showToast } = useToast()
  const { wish } = useShopStore()
  const players = useFirestoreCollection<Player>('players').items
  const squad = players.filter((p) => p.team === 'senior' && p.number != null).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const pictures = product.images?.length ? product.images : []
  const [picture, setPicture] = useState(0)
  const variants = product.variants ?? []
  const [variantIndex, setVariantIndex] = useState(variants.length > 1 ? -1 : 0)
  const variant = variants[variantIndex]
  const basePrice = variant?.price ?? product.price
  const sizes = product.sizes ?? []
  const [size, setSize] = useState(sizes.length === 0 ? 'One size' : '')
  const [print, setPrint] = useState<'none' | 'player' | 'own'>('none')
  const [playerId, setPlayerId] = useState('')
  const [ownName, setOwnName] = useState('')
  const [ownNumber, setOwnNumber] = useState('')
  const [guide, setGuide] = useState(false)
  const [qty, setQtyLocal] = useState(1)
  const chosenPlayer = squad.find((p) => p.id === playerId)
  const printName = print === 'player' ? surname(chosenPlayer?.name ?? '') : print === 'own' ? ownName.trim() : ''
  const printNumber = print === 'player' ? String(chosenPlayer?.number ?? '') : print === 'own' ? ownNumber : ''
  const printing = print !== 'none' && Boolean(printName || printNumber)
  const unit = (variant?.price ?? fromPrice(product)) + (printing ? settings.printPrice : 0)
  const soldOutSizes = product.soldOutSizes ?? []
  const kids = sizes.filter((s) => /Y$/.test(s))
  const adults = sizes.filter((s) => !/Y$/.test(s))

  function add(buy = false) {
    if (product.soldOut) return
    if (variants.length > 1 && !variant) { showToast('Choose Fan or Player version first.', 'error'); return }
    if (!size) { showToast('Choose a size first.', 'error'); return }
    if (print === 'player' && !chosenPlayer) { showToast('Choose a player for the printing.', 'error'); return }
    if (print === 'own' && !ownName.trim() && !ownNumber) { showToast('Write the name or number to print.', 'error'); return }
    addToCart({ productId: product.id, name: product.name, price: basePrice, ...(variant && variants.length > 1 ? { variant: variant.label } : {}), size: size === 'One size' ? '' : size, image: pictures[0], colour: product.colour, ...(printing ? { printName, printNumber, printPrice: settings.printPrice } : {}) }, qty)
    showToast(`${product.name} added to your cart.`)
    onAdded(buy)
  }

  return <div className="shop-product">
    <div className="shop-gallery">
      <div className="shop-gallery-main">
        {print !== 'none' && printing && product.personalisable
          ? <ShirtArt colour={product.colour} back name={printName} number={printNumber} className="shop-back-preview" />
          : pictures.length ? <img className="shop-img" src={pictures[picture] ?? pictures[0]} alt={product.name} /> : <ProductPicture product={product} />}
        {product.badge && <span className={`shop-badge b-${product.badge.toLowerCase()}`}>{product.badge}</span>}
      </div>
      {pictures.length > 1 && <div className="shop-thumbs">{pictures.map((src, i) => <button type="button" key={i} className={i === picture ? 'active' : ''} onClick={() => setPicture(i)} aria-label={`Picture ${i + 1}`}><img src={src} alt="" /></button>)}</div>}
    </div>

    <div className="shop-info">
      <small className="shop-cat">{CATEGORIES.find((c) => c.key === product.category)?.label}</small>
      <h2>{product.name}</h2>
      <Price product={product} exact={variant ? variant.price : undefined} />
      {product.description && <p className="shop-desc">{product.description}</p>}

      {siblings.length > 1 && <div className="shop-block">
        <div className="shop-block-head"><strong>Colour: {product.name.replace(/\s*(jersey|kit).*$/i, '')}</strong></div>
        <div className="shop-swatches">{siblings.map((s) => <Link key={s.id} to={`/shop/${s.id}`} replace className={s.id === product.id ? 'active' : ''} aria-label={s.name} title={s.name}>{s.images?.[0] ? <img src={s.images[0]} alt="" /> : <i style={{ background: s.swatch ?? '#ccc' }} />}</Link>)}</div>
      </div>}

      {variants.length > 1 && <div className="shop-block">
        <div className="shop-block-head"><strong>Version</strong></div>
        <div className="shop-variants" role="radiogroup" aria-label="Version">{variants.map((v, i) => <button type="button" key={v.label} role="radio" aria-checked={variantIndex === i} className={variantIndex === i ? 'active' : ''} onClick={() => setVariantIndex(i)}><span><b>{v.label}</b>{v.note && <small>{v.note}</small>}</span><em>{mwk(v.price)}</em></button>)}</div>
      </div>}

      {sizes.length > 0 && <div className="shop-block">
        <div className="shop-block-head"><strong>Size{size ? `: ${size}` : ''}</strong><button type="button" className="shop-link" onClick={() => setGuide(true)}><Ruler size={14} aria-hidden="true" /> Size guide</button></div>
        {adults.length > 0 && <div className="shop-sizes">{adults.map((s) => <button type="button" key={s} disabled={soldOutSizes.includes(s)} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>{s}</button>)}</div>}
        {kids.length > 0 && <><small className="shop-kids">Kids</small><div className="shop-sizes">{kids.map((s) => <button type="button" key={s} disabled={soldOutSizes.includes(s)} className={size === s ? 'active' : ''} onClick={() => setSize(s)}>{s}</button>)}</div></>}
      </div>}

      {product.personalisable && <div className="shop-block">
        <div className="shop-block-head"><strong>Personalise</strong><span>+ {mwk(settings.printPrice)}</span></div>
        <div className="shop-print-tabs" role="radiogroup" aria-label="Printing">
          {([['none', 'No printing'], ['player', 'Player'], ['own', 'My name']] as const).map(([k, label]) => <button type="button" key={k} role="radio" aria-checked={print === k} className={print === k ? 'active' : ''} onClick={() => setPrint(k)}>{label}</button>)}
        </div>
        {print === 'player' && (squad.length
          ? <div className="shop-players">{squad.map((p) => <button type="button" key={p.id} className={playerId === p.id ? 'active' : ''} onClick={() => setPlayerId(p.id)}><b>{p.number}</b><span>{surname(p.name)}</span></button>)}</div>
          : <p className="live-help">The squad list is loading…</p>)}
        {print === 'own' && <div className="shop-own">
          <label className="admin-field"><span>Name (max 12)</span><input value={ownName} maxLength={12} onChange={(e) => setOwnName(e.target.value.replace(/[^\p{L} .'-]/gu, ''))} placeholder="BRIAN" /></label>
          <label className="admin-field"><span>Number</span><input value={ownNumber} inputMode="numeric" maxLength={2} onChange={(e) => setOwnNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="10" /></label>
        </div>}
        {printing && <p className="live-help">The picture shows the back of the shirt with your printing.</p>}
      </div>}

      <div className="shop-qty-row">
        <span>Quantity</span>
        <div className="shop-qty"><button type="button" onClick={() => setQtyLocal(Math.max(1, qty - 1))} aria-label="Less"><Minus size={15} /></button><span>{qty}</span><button type="button" onClick={() => setQtyLocal(Math.min(10, qty + 1))} aria-label="More"><Plus size={15} /></button></div>
        <button type="button" className={`shop-wish big ${wish.includes(product.id) ? 'on' : ''}`} onClick={() => toggleWish(product.id)} aria-label="Save" aria-pressed={wish.includes(product.id)}><Heart size={18} /></button>
      </div>
      <div className="shop-buy-space" />
      {createPortal(<div className="shop-buybar">
        <div className="shop-buybar-total"><small>{[variant?.label, size && size !== 'One size' ? size : '', qty > 1 ? `× ${qty}` : ''].filter(Boolean).join(' · ') || 'Total'}</small><b>{mwk(unit * qty)}</b></div>
        {product.soldOut ? <Button type="button" disabled>Sold out</Button> : <>
          <button type="button" className="shop-buybar-cart" onClick={() => add(false)} aria-label="Add to cart"><ShoppingBag size={19} /><Plus size={12} className="plus" /></button>
          <Button type="button" onClick={() => add(true)}>Buy now</Button>
        </>}
      </div>, document.body)}
      <ul className="shop-facts">
        <li><Package size={15} aria-hidden="true" /> Free pick up at {settings.pickupPlace}</li>
        <li><Truck size={15} aria-hidden="true" /> Delivery {mwk(settings.deliveryPrice)}, free from {mwk(settings.freeDeliveryFrom)}</li>
      </ul>
    </div>

    {guide && <Sheet label="Size guide" onClose={() => setGuide(false)}>
      <div className="shop-sheet-head"><h3>Size guide</h3><button type="button" className="shop-icon-btn" onClick={() => setGuide(false)} aria-label="Close"><X size={18} /></button></div>
      <table className="shop-guide"><thead><tr><th>Size</th><th>Chest</th><th>Height</th></tr></thead><tbody>{SIZE_GUIDE.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody></table>
      <p className="live-help">Between two sizes? Take the bigger one. Kids sizes go by age.</p>
    </Sheet>}
  </div>
}

function surname(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? '').slice(0, 12)
}

type Step = 'cart' | 'details' | 'pay' | 'done'

/** Payment method mark: the official logo the club uploaded, or a plain coloured tile. */
function PayIcon({ method, settings }: { method: PayMethod; settings: ReturnType<typeof settingsWithDefaults> }) {
  const logo = method === 'airtel' ? settings.airtelLogo : method === 'mpamba' ? settings.mpambaLogo : undefined
  if (logo) return <img className="shop-pay-logo" src={logo} alt={PAY_LABEL[method]} title={PAY_LABEL[method]} />
  return <i className={`shop-pay-tile pay-${method}`} aria-hidden="true" title={PAY_LABEL[method]}>{method === 'airtel' ? 'A' : method === 'mpamba' ? 'M' : 'K'}</i>
}
type PayMethod = 'airtel' | 'mpamba' | 'cash'
const PAY_LABEL: Record<PayMethod, string> = { airtel: 'Airtel Money', mpamba: 'TNM Mpamba', cash: 'Cash when I collect' }

function Steps({ step }: { step: Step }) {
  const all: Array<[Step, string]> = [['cart', 'Cart'], ['details', 'Details'], ['pay', 'Payment'], ['done', 'Done']]
  const at = all.findIndex(([k]) => k === step)
  return <ol className="shop-steps" aria-label="Order steps">{all.map(([k, label], i) => <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''}><i>{i < at ? '✓' : i + 1}</i><span>{label}</span></li>)}</ol>
}

function CartPanel({ settings, products, startStep, onClose, onOrders }: { settings: ReturnType<typeof settingsWithDefaults>; products: ShopProduct[]; startStep: Step; onClose: () => void; onOrders: () => void }) {
  const { cart } = useShopStore()
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(startStep)
  const [name, setName] = useState(profile?.fullName ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [method, setMethod] = useState<PayMethod>('airtel')
  const [txId, setTxId] = useState('')
  const [ref] = useState(newOrderRef)
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState<{ ref: string; total: number; text: string; method: PayMethod } | null>(null)
  const lines = cart.filter((l) => products.some((p) => p.id === l.productId && !p.soldOut))
  const gone = cart.length - lines.length
  const subtotal = lines.reduce((n, l) => n + lineTotal(l), 0)
  const fee = delivery === 'delivery' && subtotal < settings.freeDeliveryFrom ? settings.deliveryPrice : 0
  const total = subtotal + fee
  const toFree = Math.max(0, settings.freeDeliveryFrom - subtotal)
  const pic = (productId: string) => products.find((p) => p.id === productId)
  const payNumber = method === 'airtel' ? settings.airtelNumber : method === 'mpamba' ? settings.mpambaNumber : ''

  function toPayment() {
    if (name.trim().length < 2) { showToast('Write your name.', 'error'); return }
    if (phone.replace(/\D/g, '').length < 9) { showToast('Write a phone number the club can call (e.g. 0991 234 567).', 'error'); return }
    if (delivery === 'delivery' && address.trim().length < 4) { showToast('Write where to deliver.', 'error'); return }
    setStep('pay')
  }

  async function placeOrder() {
    if (!user || !lines.length) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'shopOrders'), {
        ref, uid: user.uid, name: name.trim().slice(0, 80), phone: phone.trim().slice(0, 30), lines: lines.map(orderLine), delivery,
        ...(delivery === 'delivery' ? { address: address.trim().slice(0, 200) } : {}), deliveryFee: fee, total, status: 'new',
        payment: { method, ...(txId.trim() ? { txId: txId.trim().slice(0, 40) } : {}) }, createdAt: serverTimestamp(),
      })
      const text = `${orderText({ ref, name: name.trim(), phone: phone.trim(), lines, delivery, address: address.trim(), deliveryFee: fee, total, pickupPlace: settings.pickupPlace })}\nPayment: ${PAY_LABEL[method]}${txId.trim() ? ` · transaction ${txId.trim()}` : ''}`
      setPlaced({ ref, total, text, method })
      clearCart()
      setStep('done')
    } catch (error) {
      showToast(error instanceof Error ? `Order not sent: ${error.message}` : 'Order not sent. Check your connection.', 'error')
    } finally { setBusy(false) }
  }

  const back = step === 'details' ? 'cart' : step === 'pay' ? 'details' : null
  return <Sheet label="Checkout" onClose={onClose} wide>
    <div className="shop-sheet-head">
      {back ? <button type="button" className="shop-link" onClick={() => setStep(back)}><ArrowLeft size={16} aria-hidden="true" /> Back</button> : <h3>{step === 'done' ? 'Thank you!' : 'Your cart'}</h3>}
      <button type="button" className="shop-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
    {(lines.length > 0 || step === 'done') && <Steps step={step} />}

    {step === 'done' && placed ? <div className="shop-done">
      <div className="shop-done-check">✓</div>
      <h3>Order placed</h3>
      <p>Your order number is <b>{placed.ref}</b> · {mwk(placed.total)}</p>
      <ol className="shop-next">
        <li className="done"><b>Order sent</b><span>The club has your order.</span></li>
        <li><b>{placed.method === 'cash' ? 'Club confirms' : 'Payment checked'}</b><span>{placed.method === 'cash' ? 'The club calls or WhatsApps you to confirm.' : `The club checks your ${PAY_LABEL[placed.method]} payment.`}</span></li>
        <li><b>Ready</b><span>{delivery === 'delivery' ? 'Your jersey is on its way.' : `Collect at ${settings.pickupPlace}.`}</span></li>
      </ol>
      {settings.whatsapp && <a className="shop-wa big" href={waLink(settings.whatsapp, placed.text)} target="_blank" rel="noopener noreferrer">Send the order on WhatsApp</a>}
      <Button type="button" variant="secondary" onClick={onOrders}>Track my order</Button>
      <button type="button" className="shop-link center" onClick={() => { onClose(); navigate('/shop') }}>Continue shopping</button>
    </div>

    : !lines.length ? <EmptyState icon={ShoppingBag} title="Your cart is empty" description={gone ? 'Items in your cart were sold out.' : 'Find a jersey, a scarf or a cap.'} action={<Button type="button" onClick={() => { onClose(); navigate('/shop') }}>Go shopping</Button>} />

    : step === 'cart' ? <>
      {toFree > 0 ? <div className="shop-free"><span>Add {mwk(toFree)} more for free delivery</span><i style={{ width: `${Math.min(100, (subtotal / settings.freeDeliveryFrom) * 100)}%` }} /></div> : <div className="shop-free done"><span>✓ Free delivery</span><i style={{ width: '100%' }} /></div>}
      <ul className="shop-lines">{lines.map((l) => { const p = pic(l.productId); return <li key={l.key}>
        <div className="shop-line-pic">{p ? <ProductPicture product={p} /> : <ShirtArt colour={l.colour} />}</div>
        <div className="shop-line-info"><strong>{l.name}</strong><small>{[l.variant, l.size, l.printName || l.printNumber ? `Print: ${l.printName ?? ''} ${l.printNumber ?? ''}`.trim() : ''].filter(Boolean).join(' · ')}</small>
          <div className="shop-qty small"><button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Less"><Minus size={13} /></button><span>{l.qty}</span><button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="More"><Plus size={13} /></button></div></div>
        <b>{mwk(lineTotal(l))}</b>
      </li> })}</ul>
      <div className="shop-total"><span>Subtotal</span><b>{mwk(subtotal)}</b></div>
      <Button type="button" onClick={() => setStep('details')}>Checkout · {mwk(subtotal)}</Button>
    </>

    : step === 'details' ? <div className="shop-checkout">
      <label className="admin-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="admin-field"><span>Phone (WhatsApp)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0991 234 567" /></label>
      <strong className="shop-sub">How do you want to get it?</strong>
      <div className="shop-print-tabs" role="radiogroup" aria-label="Delivery">
        <button type="button" role="radio" aria-checked={delivery === 'pickup'} className={delivery === 'pickup' ? 'active' : ''} onClick={() => setDelivery('pickup')}>Pick up · free</button>
        <button type="button" role="radio" aria-checked={delivery === 'delivery'} className={delivery === 'delivery' ? 'active' : ''} onClick={() => setDelivery('delivery')}>Delivery · {subtotal >= settings.freeDeliveryFrom ? 'free' : mwk(settings.deliveryPrice)}</button>
      </div>
      {delivery === 'pickup' ? <p className="live-help">Pick up at {settings.pickupPlace}. The club tells you when it's ready.</p>
        : <label className="admin-field"><span>Deliver to (town, area, landmark)</span><textarea rows={2} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} placeholder="Blantyre, Chilomoni, near the market" /></label>}
      <div className="shop-total"><span>Items</span><b>{mwk(subtotal)}</b></div>
      <div className="shop-total"><span>Delivery</span><b>{fee ? mwk(fee) : 'Free'}</b></div>
      <div className="shop-total grand"><span>Total</span><b>{mwk(total)}</b></div>
      <Button type="button" onClick={toPayment}>Continue to payment</Button>
    </div>

    : <div className="shop-checkout">
      <strong className="shop-sub">How will you pay {mwk(total)}?</strong>
      <div className="shop-paylist" role="radiogroup" aria-label="Payment">
        {(['airtel', 'mpamba', 'cash'] as PayMethod[]).map((m) => <button type="button" key={m} role="radio" aria-checked={method === m} className={`pay-${m} ${method === m ? 'active' : ''}`} onClick={() => setMethod(m)}><PayIcon method={m} settings={settings} /><span>{PAY_LABEL[m]}</span></button>)}
      </div>
      {method === 'cash' ? <p className="shop-paybox">Pay {mwk(total)} in cash when you {delivery === 'delivery' ? 'receive your order' : `collect at ${settings.pickupPlace}`}. The club will confirm your order first.</p>
        : <div className="shop-paybox">
          {payNumber ? <>
            <p>Send <b>{mwk(total)}</b> with {PAY_LABEL[method]} to:</p>
            <p className="shop-paynum"><b>{payNumber}</b>{settings.payName && <small>{settings.payName}</small>}</p>
            <button type="button" className="shop-link" onClick={() => { void navigator.clipboard?.writeText(payNumber.replace(/\s/g, '')).then(() => showToast('Number copied.')).catch(() => undefined) }}>Copy number</button>
            <p>Write <b>{ref}</b> as the reference, if your phone asks.</p>
          </> : <p>After you place the order, the club sends you the {PAY_LABEL[method]} number on WhatsApp. Pay {mwk(total)} and send the transaction ID.</p>}
          <label className="admin-field"><span>Transaction ID from the SMS (if you paid already)</span><input value={txId} maxLength={40} onChange={(e) => setTxId(e.target.value)} placeholder="e.g. CI251025.1530.A12345" /></label>
          <small className="live-help">You can also add it later in My orders.</small>
        </div>}
      <div className="shop-total grand"><span>Total</span><b>{mwk(total)}</b></div>
      <Button type="button" disabled={busy} onClick={() => void placeOrder()}>{busy ? 'Placing order…' : `Place order · ${mwk(total)}`}</Button>
    </div>}
  </Sheet>
}

const PROGRESS: OrderStatus[] = ['new', 'confirmed', 'paid', 'ready', 'collected']

function OrdersPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const settings = useShopSettings()
  const [orders, setOrders] = useState<ShopOrder[] | null>(null)
  const [tx, setTx] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!user) return
    return onSnapshot(query(collection(db, 'shopOrders'), where('uid', '==', user.uid)), (snap) => setOrders(snap.docs.map((d) => ({ ...(d.data() as ShopOrder), id: d.id })).sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity))), () => setOrders([]))
  }, [user])
  async function saveTx(o: ShopOrder) {
    const value = (tx[o.id] ?? '').trim()
    if (value.length < 4) { showToast('Write the transaction ID from the SMS.', 'error'); return }
    try { await updateDoc(doc(db, 'shopOrders', o.id), { payment: { method: o.payment?.method ?? 'airtel', txId: value.slice(0, 40) } }); showToast('Sent to the club.') }
    catch (e) { showToast(e instanceof Error ? e.message : 'Not saved.', 'error') }
  }
  return <Sheet label="My orders" onClose={onClose} wide>
    <div className="shop-sheet-head"><h3>My orders</h3><button type="button" className="shop-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {orders === null ? <p className="page-loading">Loading…</p> : !orders.length ? <EmptyState icon={Package} title="No orders yet" description="Your shop orders and their status show here." />
      : <ul className="shop-orders">{orders.map((o) => { const at = PROGRESS.indexOf(o.status); return <li key={o.id}>
        <div><strong>{o.ref}</strong><span className={`shop-status s-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span></div>
        <small>{o.lines.map((l) => `${l.qty} × ${l.name}${l.variant ? `, ${l.variant}` : ''}${l.size ? ` (${l.size})` : ''}`).join(', ')}</small>
        <b>{mwk(o.total)}{o.payment ? <small> · {PAY_LABEL[o.payment.method as PayMethod] ?? o.payment.method}</small> : null}</b>
        {o.status !== 'cancelled' && <div className="shop-track" aria-label="Progress">{PROGRESS.map((s, i) => <span key={s} className={i <= at ? 'on' : ''} title={STATUS_LABEL[s]} />)}</div>}
        {o.status === 'new' && o.payment && o.payment.method !== 'cash' && !o.payment.txId && <div className="shop-tx">
          <input value={tx[o.id] ?? ''} maxLength={40} placeholder="Paid? Transaction ID" onChange={(e) => setTx({ ...tx, [o.id]: e.target.value })} />
          <button type="button" onClick={() => void saveTx(o)}>Send</button>
        </div>}
        {o.payment?.txId && <small>Transaction: {o.payment.txId}</small>}
        {settings.whatsapp && <a className="shop-link" href={waLink(settings.whatsapp, `Hello, about my Ekhaya FC shop order ${o.ref} (${mwk(o.total)}): `)} target="_blank" rel="noopener noreferrer">Ask the club on WhatsApp</a>}
      </li> })}</ul>}
  </Sheet>
}
