// Club shop, built the way big club stores work: a shop window, categories,
// product pages with sizes and a size guide, name & number printing (pick a
// player or your own name), wishlist, a cart and an order that goes to the
// club on WhatsApp. /shop and /shop/:id
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { ArrowLeft, Check, Heart, Minus, Package, Plus, Ruler, ShieldCheck, Shirt, ShoppingBag, Truck, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
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
  // Items only admins may see (e.g. the MK 100 payment test) live apart, where fans can't read them.
  const staffItems = useFirestoreCollection<Omit<ShopProduct, 'id'>>('shopProductsStaff', isStaff)
  const products = useMemo(() => ([...all.items, ...(isStaff ? staffItems.items : [])] as ShopProduct[]).filter((p) => isPublished(p) && (!p.staffOnly || isStaff)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name)), [all.items, staffItems.items, isStaff])
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
  const picks = products.filter((p) => (p.featured || p.badge === 'New') && !p.soldOut)
  const featured = (picks.length > 1 ? picks : products.filter((p) => !p.soldOut)).slice(0, 8)
  const personalise = products.find((p) => p.personalisable && !p.soldOut)

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

  if (id) return <div className="shop">{bar}{product ? <ProductPage key={product.id} product={product} siblings={product.group ? products.filter((p) => p.group === product.group) : []} related={products.filter((p) => p.id !== product.id && !(product.group && p.group === product.group) && !p.soldOut).sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0, 6)} settings={settings} onAdded={(buy) => setParams(buy ? { cart: '1', step: 'details' } : { cart: '1' })} /> : <EmptyState icon={Shirt} title="Not in the shop" description="This item was sold out or taken off the shop." />}{panels}</div>

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
      <span><ShieldCheck size={15} aria-hidden="true" /> Official Ekhaya FC store</span>
      <span><Shirt size={15} aria-hidden="true" /> Add name &amp; number</span>
      <span><Package size={15} aria-hidden="true" /> Collect at {settings.pickupPlace}</span>
    </div>

    {category === 'all' && featured.length > 1 && <section className="shop-reel">
      <div className="shop-reel-head"><h2>New in</h2><Link to="/shop" className="shop-reel-all" onClick={() => setCategory('all')}>The latest Ekhaya drops</Link></div>
      <div className="shop-reel-track">{featured.map((p) => <Link key={p.id} to={`/shop/${p.id}`} className="shop-feature">
        <div className="shop-feature-pic"><ProductPicture product={p} />{p.badge ? <span className={`shop-badge b-${p.badge.toLowerCase()}`}>{p.badge}</span> : null}</div>
        <strong>{p.name}</strong><Price product={p} />
      </Link>)}</div>
    </section>}

    <div className="shop-chips" role="tablist" aria-label="Categories">
      {[{ key: 'all' as const, label: 'All' }, ...CATEGORIES.filter((c) => products.some((p) => p.category === c.key)), ...(wish.length ? [{ key: 'wish' as const, label: <><Heart size={13} aria-hidden="true" /> Saved ({wish.length})</> }] : [])].map((c) =>
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
    {personalise && category === 'all' && <Link to={`/shop/${personalise.id}`} className="shop-promo">
      <div className="shop-promo-text"><small>Make it yours</small><h3>Your name on the shirt</h3><p>Add any name and number to the official Ekhaya kit — just like the players.</p><span className="shop-hero-cta">Personalise now</span></div>
      <ProductPicture product={personalise} className="shop-promo-pic" />
    </Link>}
    <div className="shop-accept"><span>We accept</span>{(['airtel', 'mpamba', 'fdh'] as PayMethod[]).map((m) => <PayIcon key={m} method={m} settings={settings} />)}</div>
    <p className="shop-pay-note">{settings.paymentNote}</p>
    {panels}
  </div>
}

function ProductPage({ product, siblings, related, settings, onAdded }: { product: ShopProduct; siblings: ShopProduct[]; related: ShopProduct[]; settings: ReturnType<typeof settingsWithDefaults>; onAdded: (buy: boolean) => void }) {
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
        <li><Truck size={15} aria-hidden="true" /> Delivery {mwk(settings.deliveryPrice)}</li>
      </ul>
    </div>

    {related.length > 0 && <section className="shop-reel shop-reel-related">
      <div className="shop-reel-head"><h2>Complete the look</h2><span className="shop-reel-all">More from the Ekhaya store</span></div>
      <div className="shop-reel-track">{related.map((p) => <Link key={p.id} to={`/shop/${p.id}`} className="shop-feature">
        <div className="shop-feature-pic"><ProductPicture product={p} />{p.badge ? <span className={`shop-badge b-${p.badge.toLowerCase()}`}>{p.badge}</span> : null}</div>
        <strong>{p.name}</strong><Price product={p} />
      </Link>)}</div>
    </section>}

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

const PIN_FAIL: Record<string, string> = {
  wrong_pin: 'The PIN was wrong. Tap Try again to get a new message.',
  no_balance: 'There is not enough money in the account. Top up and tap Try again.',
  cancelled: 'The payment was cancelled on the phone. Tap Try again.',
  timeout: 'The PIN message timed out. Tap Try again.',
  failed: 'The payment did not go through. Tap Try again, or pay another way.',
}
const payApiBase = (s: { payApi?: string }) => (s.payApi || import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
/** The payment server: the club's Firebase functions (cloudfunctions.net), or a Netlify site. */
const payUrl = (s: { payApi?: string }, step: 'start' | 'check') => {
  const base = payApiBase(s)
  return /netlify/i.test(base) ? `${base}/.netlify/functions/shop-pay-${step}` : `${base}/${step === 'start' ? 'shopPayStart' : 'shopPayCheck'}`
}

/** Payment method mark: the official logo the club uploaded, or a plain coloured tile. */
function PayIcon({ method, settings }: { method: PayMethod; settings: ReturnType<typeof settingsWithDefaults> }) {
  const logo = method === 'airtel' ? settings.airtelLogo : method === 'mpamba' ? settings.mpambaLogo : method === 'fdh' ? settings.fdhLogo : undefined
  if (logo) return <img className="shop-pay-logo" src={logo} alt={PAY_LABEL[method]} title={PAY_LABEL[method]} />
  return <i className={`shop-pay-tile pay-${method}`} aria-hidden="true" title={PAY_LABEL[method]}>{method === 'airtel' ? 'A' : method === 'mpamba' ? 'M' : method === 'fdh' ? 'FDH' : 'K'}</i>
}
type PayMethod = 'airtel' | 'mpamba' | 'fdh' | 'cash'
const PAY_LABEL: Record<PayMethod, string> = { airtel: 'Airtel Money', mpamba: 'TNM Mpamba', fdh: 'FDH Bank transfer', cash: 'Cash when I collect' }

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
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [delivery] = useState<'pickup' | 'delivery'>('pickup')
  const [address] = useState('')
  const [method, setMethod] = useState<PayMethod>('airtel')
  const [txId, setTxId] = useState('')
  const [ref] = useState(newOrderRef)
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState<{ ref: string; total: number; text: string; method: PayMethod; paid?: boolean } | null>(null)
  // PIN payments (PayChangu): on when switched on and the payment server is set.
  const staff = profile?.role === 'admin' || profile?.role === 'superadmin'
  const pinTest = settings.payMode !== 'live'
  const pinOn = useFlag('shopPinPay') && Boolean(payApiBase(settings)) && (!pinTest || staff)
  const [payFrom, setPayFrom] = useState('')
  const [orderId, setOrderId] = useState('')
  const [pin, setPin] = useState<{ state: 'idle' | 'starting' | 'waiting' | 'failed'; message?: string; txRef?: string }>({ state: 'idle' })
  const [manual, setManual] = useState(false)
  const usePin = pinOn && !manual && (method === 'airtel' || method === 'mpamba')
  const lines = cart.filter((l) => products.some((p) => p.id === l.productId && !p.soldOut))
  const gone = cart.length - lines.length
  const subtotal = lines.reduce((n, l) => n + lineTotal(l), 0)
  const fee = delivery === 'delivery' ? settings.deliveryPrice : 0
  const total = subtotal + fee
  const pic = (productId: string) => products.find((p) => p.id === productId)
  const payNumber = method === 'airtel' ? settings.airtelNumber : method === 'mpamba' ? settings.mpambaNumber : ''

  function toPayment() {
    if (name.trim().length < 2) { showToast('Write your name.', 'error'); return }
    if (phone.replace(/\D/g, '').length < 9) { showToast('Write a phone number the club can call (e.g. 0991 234 567).', 'error'); return }
    if (delivery === 'delivery' && address.trim().length < 4) { showToast('Write where to deliver.', 'error'); return }
    if (!payFrom.trim()) setPayFrom(phone.trim())
    setStep('pay')
  }

  async function placeOrder(): Promise<string | null> {
    if (!user || !lines.length) return orderId || null
    setBusy(true)
    try {
      // The order and the fan's "last order" time are saved together: the
      // database allows one order per fan per minute (no order spam).
      const created = doc(collection(db, 'shopOrders'))
      const batch = writeBatch(db)
      batch.update(doc(db, 'users', user.uid), { lastOrderAt: serverTimestamp(), updatedAt: serverTimestamp() })
      batch.set(created, {
        ref, uid: user.uid, name: name.trim().slice(0, 80), phone: phone.trim().slice(0, 30), lines: lines.map(orderLine), delivery,
        ...(delivery === 'delivery' ? { address: address.trim().slice(0, 200) } : {}), deliveryFee: fee, total, status: 'new',
        payment: { method, ...(txId.trim() ? { txId: txId.trim().slice(0, 40) } : {}) }, createdAt: serverTimestamp(),
      })
      await batch.commit()
      const text = `${orderText({ ref, name: name.trim(), phone: phone.trim(), lines, delivery, address: address.trim(), deliveryFee: fee, total, pickupPlace: settings.pickupPlace })}\nPayment: ${PAY_LABEL[method]}${txId.trim() ? ` · transaction ${txId.trim()}` : ''}`
      setPlaced({ ref, total, text, method })
      setOrderId(created.id)
      if (!usePin) { clearCart(); setStep('done') }
      return created.id
    } catch (error) {
      showToast(/permission/i.test(String((error as Error)?.message)) ? 'Please wait a minute before sending another order.' : error instanceof Error ? `Order not sent: ${error.message}` : 'Order not sent. Check your connection.', 'error')
      return null
    } finally { setBusy(false) }
  }

  /** The order was saved during a PIN try; the fan paid another way instead. */
  async function finishManual() {
    if (orderId && txId.trim()) await updateDoc(doc(db, 'shopOrders', orderId), { payment: { method, txId: txId.trim().slice(0, 40) } }).catch(() => undefined)
    clearCart()
    setStep('done')
  }

  /** Pay now: save the order (once), then PayChangu sends the PIN prompt to the fan's phone. */
  async function payWithPin() {
    if (!user) return
    if (payFrom.replace(/\D/g, '').length < 9) { showToast('Enter the Airtel Money or TNM Mpamba number to pay from.', 'error'); return }
    const id = orderId || await placeOrder()
    if (!id) return
    setPin({ state: 'starting' })
    try {
      // Force-refresh so the token reflects the latest email-verified status
      // (a cached token from before verification would wrongly block payment).
      const token = await user.getIdToken(true)
      const response = await fetch(payUrl(settings, 'start'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: id, method, phone: payFrom }) })
      const result = await response.json().catch(() => ({})) as { txRef?: string; error?: string }
      if (!response.ok || !result.txRef) throw new Error(result.error || 'Could not send the PIN request.')
      setPin({ state: 'waiting', txRef: result.txRef })
    } catch (error) {
      setPin({ state: 'failed', message: error instanceof Error ? error.message : 'Could not send the PIN request.' })
    }
  }

  // While waiting, ask every 5 seconds whether the PIN was entered (up to 3 minutes).
  useEffect(() => {
    if (pin.state !== 'waiting' || !pin.txRef || !user) return
    let tries = 0
    let stopped = false
    const tick = async () => {
      if (stopped) return
      tries += 1
      try {
        const token = await user.getIdToken()
        const response = await fetch(payUrl(settings, 'check'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ txRef: pin.txRef }) })
        const result = await response.json().catch(() => ({})) as { status?: string; reason?: string }
        if (stopped) return
        if (result.status === 'paid') { setPlaced((p) => p && { ...p, paid: true }); setPin({ state: 'idle' }); clearCart(); setStep('done'); return }
        if (result.status === 'failed') { setPin({ state: 'failed', message: PIN_FAIL[result.reason ?? ''] ?? PIN_FAIL.failed }); return }
        if (result.status === 'review') { setPin({ state: 'idle' }); clearCart(); setStep('done'); return }
      } catch { /* try again */ }
      if (tries >= 36) { setPin({ state: 'failed', message: 'We did not get the payment yet. If you entered your PIN, wait a minute and check My orders.' }); return }
      window.setTimeout(() => void tick(), 5000)
    }
    const first = window.setTimeout(() => void tick(), 6000)
    return () => { stopped = true; window.clearTimeout(first) }
  }, [pin.state, pin.txRef, user, settings])

  const back = step === 'details' ? 'cart' : step === 'pay' ? 'details' : null
  return <Sheet label="Checkout" onClose={onClose} wide>
    <div className="shop-sheet-head">
      {back ? <button type="button" className="shop-link" onClick={() => setStep(back)}><ArrowLeft size={16} aria-hidden="true" /> Back</button> : <h3>{step === 'done' ? 'Thank you!' : 'Your cart'}</h3>}
      <button type="button" className="shop-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
    {(lines.length > 0 || step === 'done') && <Steps step={step} />}

    {step === 'done' && placed ? <div className="shop-done">
      <div className="shop-done-check"><Check size={30} strokeWidth={3} aria-hidden="true" /></div>
      <h3>{placed.paid ? 'Paid' : 'Order placed'}</h3>
      <p>Your order number is <b>{placed.ref}</b> · {mwk(placed.total)}</p>
      <ol className="shop-next">
        <li className="done"><b>Order sent</b><span>The club has your order.</span></li>
        {placed.paid ? <li className="done"><b>Paid with {PAY_LABEL[placed.method]}</b><span>Your payment of {mwk(placed.total)} was received.</span></li> : <li><b>{placed.method === 'cash' ? 'Club confirms' : 'Payment checked'}</b><span>{placed.method === 'cash' ? 'The club calls or WhatsApps you to confirm.' : `The club checks your ${PAY_LABEL[placed.method]} payment.`}</span></li>}
        <li><b>Ready</b><span>{delivery === 'delivery' ? 'Your jersey is on its way.' : `Collect at ${settings.pickupPlace}.`}</span></li>
      </ol>
      {settings.whatsapp && <a className="shop-wa big" href={waLink(settings.whatsapp, placed.text)} target="_blank" rel="noopener noreferrer">Send the order on WhatsApp</a>}
      <Button type="button" variant="secondary" onClick={onOrders}>Track my order</Button>
      <button type="button" className="shop-link center" onClick={() => { onClose(); navigate('/shop') }}>Continue shopping</button>
    </div>

    : !lines.length ? <EmptyState icon={ShoppingBag} title="Your cart is empty" description={gone ? 'Items in your cart were sold out.' : 'Find a jersey, a scarf or a cap.'} action={<Button type="button" onClick={() => { onClose(); navigate('/shop') }}>Go shopping</Button>} />

    : step === 'cart' ? <>
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
      <p className="live-help">Collect at {settings.pickupPlace}. The club tells you when it's ready.</p>
      <div className="shop-total grand"><span>Total</span><b>{mwk(total)}</b></div>
      <Button type="button" onClick={toPayment}>Continue to payment</Button>
    </div>

    : <div className="shop-checkout">
      <strong className="shop-sub">How will you pay {mwk(total)}?</strong>
      <div className="shop-paylist" role="radiogroup" aria-label="Payment">
        {(['airtel', 'mpamba', 'fdh'] as PayMethod[]).map((m) => <button type="button" key={m} role="radio" aria-checked={method === m} disabled={pin.state === 'waiting' || pin.state === 'starting'} className={`pay-${m} ${method === m ? 'active' : ''}`} onClick={() => { setMethod(m); if (pin.state === 'failed') setPin({ state: 'idle' }) }}><PayIcon method={m} settings={settings} /><span>{PAY_LABEL[m]}</span></button>)}
      </div>
      {method === 'cash' ? <p className="shop-paybox">Pay {mwk(total)} in cash when you {delivery === 'delivery' ? 'receive your order' : `collect at ${settings.pickupPlace}`}. The club will confirm your order first.</p>
        : method === 'fdh' ? <div className="shop-paybox">
          {settings.fdhAccount ? <>
            <p>Transfer <b>{mwk(total)}</b> to the club's FDH Bank account:</p>
            <p className="shop-paynum"><b>{settings.fdhAccount}</b><small>{[settings.fdhAccountName || settings.payName, settings.fdhBranch ? `${settings.fdhBranch} branch` : ''].filter(Boolean).join(' · ')}</small></p>
            <button type="button" className="shop-link" onClick={() => { void navigator.clipboard?.writeText((settings.fdhAccount ?? '').replace(/\s/g, '')).then(() => showToast('Account number copied.')).catch(() => undefined) }}>Copy account number</button>
            <p>Use <b>{ref}</b> as the payment reference. You can pay with the FDH app, internet banking, an agent or at a branch.</p>
          </> : <p>After you place the order, the club sends you the FDH Bank account details on WhatsApp. Transfer {mwk(total)} and send the reference.</p>}
          <label className="admin-field"><span>Transfer reference from the bank (if you paid already)</span><input value={txId} maxLength={40} onChange={(e) => setTxId(e.target.value)} placeholder="e.g. FT26299ABC123" /></label>
          <small className="live-help">You can also add it later in My orders.</small>
        </div>
        : usePin ? <div className="shop-paybox shop-pinbox">
          {pin.state === 'waiting' || pin.state === 'starting' ? <div className="shop-pinwait" role="status">
            <div className="shop-spinner" aria-hidden="true" />
            <b>{pin.state === 'starting' ? 'Sending the request…' : 'Check your phone'}</b>
            <p>{pin.state === 'starting' ? 'One moment.' : <>{method === 'airtel' ? 'An' : 'A'} {PAY_LABEL[method]} message is on <b>{payFrom}</b>. Enter your PIN to pay <b>{mwk(total)}</b> to Ekhaya FC.</>}</p>
            <small className="live-help">Keep this screen open. It changes by itself when the money arrives.</small>
          </div> : <>
            {pinTest && <p className="shop-pinfail">STAFF PREVIEW · only admins see this. Live key — real money moves.</p>}
            <p>Pay <b>{mwk(total)}</b> straight from your {PAY_LABEL[method]}. You'll get a message on your phone to enter your PIN.</p>
            <label className="admin-field"><span>{PAY_LABEL[method]} number to pay from</span><input value={payFrom} inputMode="tel" autoComplete="tel" maxLength={20} onChange={(e) => setPayFrom(e.target.value)} placeholder={method === 'airtel' ? '099… / 098…' : '088…'} /></label>
            {pin.state === 'failed' && <p className="shop-pinfail">{pin.message}</p>}
          </>}
          {pin.state !== 'waiting' && pin.state !== 'starting' && <button type="button" className="shop-link" onClick={() => setManual(true)}>Pay another way (send money and enter the transaction ID)</button>}
        </div>
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
      {usePin
        ? pin.state !== 'waiting' && <Button type="button" disabled={busy || pin.state === 'starting'} onClick={() => void payWithPin()}>{pin.state === 'failed' ? `Try again · ${mwk(total)}` : `Pay now · ${mwk(total)}`}</Button>
        : <Button type="button" disabled={busy} onClick={() => void (orderId ? finishManual() : placeOrder())}>{busy ? 'Placing order…' : orderId ? 'Done' : `Place order · ${mwk(total)}`}</Button>}
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
        {(o.status === 'paid' || o.status === 'ready') && o.delivery === 'pickup' && <div className="shop-pass">
          <div className="shop-pass-qr"><QRCodeSVG value={o.ref} size={128} level="M" /></div>
          <div className="shop-pass-info"><span className="shop-pass-label">Collection pass</span><strong>{o.ref}</strong><small>Show this at {settings.pickupPlace} to collect. Staff scan it once — keep it safe.</small></div>
        </div>}
        {o.status === 'collected' && <div className="shop-pass shop-pass-done"><span className="shop-pass-stamp">✓ Collected</span><small>This order has been collected{o.collectedAt?.seconds ? ` on ${new Date(o.collectedAt.seconds * 1000).toLocaleDateString()}` : ''}.</small></div>}
        {settings.whatsapp && <a className="shop-link" href={waLink(settings.whatsapp, `Hello, about my Ekhaya FC shop order ${o.ref} (${mwk(o.total)}): `)} target="_blank" rel="noopener noreferrer">Ask the club on WhatsApp</a>}
      </li> })}</ul>}
  </Sheet>
}
