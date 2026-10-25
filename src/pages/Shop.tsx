// Club shop, built the way big club stores work: a shop window, categories,
// product pages with sizes and a size guide, name & number printing (pick a
// player or your own name), wishlist, a cart and an order that goes to the
// club on WhatsApp. /shop and /shop/:id
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
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
  type ShopCategory, type ShopOrder, type ShopProduct,
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
    {cartOpen && <CartPanel settings={settings} products={products} onClose={() => openPanel(null)} onOrders={() => openPanel('orders')} />}
    {ordersOpen && <OrdersPanel onClose={() => openPanel(null)} />}
  </>

  if (!shopOpen) return <div className="shop"><h1 className="shop-title">Club Shop</h1><EmptyState icon={ShoppingBag} title="Coming soon" description="The Ekhaya shop is closed for now. Check back soon." /></div>

  if (all.loading) return <div className="shop">{bar}<p className="page-loading">Loading the shop…</p></div>

  if (id) return <div className="shop">{bar}{product ? <ProductPage key={product.id} product={product} siblings={product.group ? products.filter((p) => p.group === product.group) : []} settings={settings} onAdded={() => openPanel('cart')} /> : <EmptyState icon={Shirt} title="Not in the shop" description="This item was sold out or taken off the shop." />}{panels}</div>

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
    <p className="shop-pay-note">{settings.paymentNote}</p>
    {panels}
  </div>
}

function ProductPage({ product, siblings, settings, onAdded }: { product: ShopProduct; siblings: ShopProduct[]; settings: ReturnType<typeof settingsWithDefaults>; onAdded: () => void }) {
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

  function add() {
    if (product.soldOut) return
    if (variants.length > 1 && !variant) { showToast('Choose Fan or Player version first.', 'error'); return }
    if (!size) { showToast('Choose a size first.', 'error'); return }
    if (print === 'player' && !chosenPlayer) { showToast('Choose a player for the printing.', 'error'); return }
    if (print === 'own' && !ownName.trim() && !ownNumber) { showToast('Write the name or number to print.', 'error'); return }
    addToCart({ productId: product.id, name: product.name, price: basePrice, ...(variant && variants.length > 1 ? { variant: variant.label } : {}), size: size === 'One size' ? '' : size, image: pictures[0], colour: product.colour, ...(printing ? { printName, printNumber, printPrice: settings.printPrice } : {}) }, qty)
    showToast(`${product.name} added to your cart.`)
    onAdded()
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

      <div className="shop-buy">
        <div className="shop-qty"><button type="button" onClick={() => setQtyLocal(Math.max(1, qty - 1))} aria-label="Less"><Minus size={15} /></button><span>{qty}</span><button type="button" onClick={() => setQtyLocal(Math.min(10, qty + 1))} aria-label="More"><Plus size={15} /></button></div>
        <Button type="button" disabled={product.soldOut} onClick={add}>{product.soldOut ? 'Sold out' : `Add to cart · ${mwk(unit * qty)}`}</Button>
        <button type="button" className={`shop-wish big ${wish.includes(product.id) ? 'on' : ''}`} onClick={() => toggleWish(product.id)} aria-label="Save" aria-pressed={wish.includes(product.id)}><Heart size={18} /></button>
      </div>
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

function CartPanel({ settings, products, onClose, onOrders }: { settings: ReturnType<typeof settingsWithDefaults>; products: ShopProduct[]; onClose: () => void; onOrders: () => void }) {
  const { cart } = useShopStore()
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState<'cart' | 'checkout'>('cart')
  const [name, setName] = useState(profile?.fullName ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const lines = cart.filter((l) => products.some((p) => p.id === l.productId && !p.soldOut))
  const gone = cart.length - lines.length
  const subtotal = lines.reduce((n, l) => n + lineTotal(l), 0)
  const fee = delivery === 'delivery' && subtotal < settings.freeDeliveryFrom ? settings.deliveryPrice : 0
  const total = subtotal + fee
  const toFree = Math.max(0, settings.freeDeliveryFrom - subtotal)
  const pic = (productId: string) => products.find((p) => p.id === productId)

  async function placeOrder() {
    if (!user) return
    if (name.trim().length < 2 || phone.replace(/\D/g, '').length < 9) { showToast('Write your name and a phone number the club can call.', 'error'); return }
    if (delivery === 'delivery' && address.trim().length < 4) { showToast('Write where to deliver.', 'error'); return }
    setBusy(true)
    const ref = newOrderRef()
    const clean = lines.map(orderLine)
    try {
      await addDoc(collection(db, 'shopOrders'), { ref, uid: user.uid, name: name.trim().slice(0, 80), phone: phone.trim().slice(0, 30), lines: clean, delivery, ...(delivery === 'delivery' ? { address: address.trim().slice(0, 200) } : {}), deliveryFee: fee, total, status: 'new', createdAt: serverTimestamp() })
      const text = orderText({ ref, name: name.trim(), phone: phone.trim(), lines, delivery, address: address.trim(), deliveryFee: fee, total, pickupPlace: settings.pickupPlace })
      clearCart()
      showToast(`Order ${ref} sent to the club.`)
      if (settings.whatsapp) window.open(waLink(settings.whatsapp, text), '_blank', 'noopener')
      onOrders()
    } catch (error) {
      showToast(error instanceof Error ? `Order not sent: ${error.message}` : 'Order not sent. Check your connection.', 'error')
    } finally { setBusy(false) }
  }

  return <Sheet label="Cart" onClose={onClose} wide>
    <div className="shop-sheet-head">
      {step === 'checkout' ? <button type="button" className="shop-link" onClick={() => setStep('cart')}><ArrowLeft size={16} aria-hidden="true" /> Cart</button> : <h3>Your cart</h3>}
      <button type="button" className="shop-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
    </div>
    {!lines.length ? <EmptyState icon={ShoppingBag} title="Your cart is empty" description={gone ? 'Items in your cart were sold out.' : 'Find a kit, a scarf or a cap.'} action={<Button type="button" onClick={() => { onClose(); navigate('/shop') }}>Go shopping</Button>} />
      : step === 'cart' ? <>
        {toFree > 0 ? <div className="shop-free"><span>Add {mwk(toFree)} more for free delivery</span><i style={{ width: `${Math.min(100, (subtotal / settings.freeDeliveryFrom) * 100)}%` }} /></div> : <div className="shop-free done"><span>✓ Free delivery</span><i style={{ width: '100%' }} /></div>}
        <ul className="shop-lines">{lines.map((l) => { const p = pic(l.productId); return <li key={l.key}>
          <div className="shop-line-pic">{p ? <ProductPicture product={p} /> : <ShirtArt colour={l.colour} />}</div>
          <div className="shop-line-info"><strong>{l.name}</strong><small>{[l.variant, l.size, l.printName || l.printNumber ? `Print: ${l.printName ?? ''} ${l.printNumber ?? ''}`.trim() : ''].filter(Boolean).join(' · ')}</small>
            <div className="shop-qty small"><button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Less"><Minus size={13} /></button><span>{l.qty}</span><button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="More"><Plus size={13} /></button></div></div>
          <b>{mwk(lineTotal(l))}</b>
        </li> })}</ul>
        <div className="shop-total"><span>Subtotal</span><b>{mwk(subtotal)}</b></div>
        <Button type="button" onClick={() => setStep('checkout')}>Checkout</Button>
      </>
        : <div className="shop-checkout">
          <label className="admin-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="admin-field"><span>Phone (WhatsApp)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0991 234 567" /></label>
          <div className="shop-print-tabs" role="radiogroup" aria-label="Delivery">
            <button type="button" role="radio" aria-checked={delivery === 'pickup'} className={delivery === 'pickup' ? 'active' : ''} onClick={() => setDelivery('pickup')}>Pick up · free</button>
            <button type="button" role="radio" aria-checked={delivery === 'delivery'} className={delivery === 'delivery' ? 'active' : ''} onClick={() => setDelivery('delivery')}>Delivery · {subtotal >= settings.freeDeliveryFrom ? 'free' : mwk(settings.deliveryPrice)}</button>
          </div>
          {delivery === 'pickup' ? <p className="live-help">Pick up at {settings.pickupPlace}. The club tells you when it's ready.</p>
            : <label className="admin-field"><span>Deliver to (area, landmark)</span><textarea rows={2} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} placeholder="Chilomoni, near the market, Blantyre" /></label>}
          <div className="shop-total"><span>Items</span><b>{mwk(subtotal)}</b></div>
          <div className="shop-total"><span>Delivery</span><b>{fee ? mwk(fee) : 'Free'}</b></div>
          <div className="shop-total grand"><span>Total</span><b>{mwk(total)}</b></div>
          <p className="shop-pay-note">{settings.paymentNote}</p>
          <Button type="button" disabled={busy} onClick={() => void placeOrder()}>{busy ? 'Sending…' : settings.whatsapp ? 'Send order on WhatsApp' : 'Send order to the club'}</Button>
        </div>}
  </Sheet>
}

function OrdersPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [orders, setOrders] = useState<ShopOrder[] | null>(null)
  useEffect(() => {
    if (!user) return
    return onSnapshot(query(collection(db, 'shopOrders'), where('uid', '==', user.uid)), (snap) => setOrders(snap.docs.map((d) => ({ ...(d.data() as ShopOrder), id: d.id })).sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity))), () => setOrders([]))
  }, [user])
  return <Sheet label="My orders" onClose={onClose} wide>
    <div className="shop-sheet-head"><h3>My orders</h3><button type="button" className="shop-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {orders === null ? <p className="page-loading">Loading…</p> : !orders.length ? <EmptyState icon={Package} title="No orders yet" description="Your shop orders and their status show here." />
      : <ul className="shop-orders">{orders.map((o) => <li key={o.id}>
        <div><strong>{o.ref}</strong><span className={`shop-status s-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span></div>
        <small>{o.lines.map((l) => `${l.qty} × ${l.name}${l.variant ? `, ${l.variant}` : ''}${l.size ? ` (${l.size})` : ''}`).join(', ')}</small>
        <b>{mwk(o.total)}</b>
      </li>)}</ul>}
  </Sheet>
}
