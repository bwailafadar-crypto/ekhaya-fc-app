// Club shop: products, cart, wishlist and order text.
// Products live in shopProducts, settings in shopSettings/main, orders in shopOrders.
import { useSyncExternalStore } from 'react'

export type ShopCategory = 'kits' | 'training' | 'fanwear' | 'accessories'
export type ShopBadge = '' | 'New' | 'Bestseller' | 'Limited' | 'Sale'

export interface ShopProduct {
  id: string
  name: string
  category: ShopCategory
  price: number
  oldPrice?: number | null
  description?: string
  images?: string[]
  sizes?: string[]
  soldOutSizes?: string[]
  soldOut?: boolean
  badge?: ShopBadge
  personalisable?: boolean
  featured?: boolean
  active?: boolean
  order?: number
  /** Jersey colours for the drawn shirt when there is no photo. */
  colour?: 'home' | 'away' | 'third' | 'training' | 'purple'
  /** Versions with their own price, e.g. Fan version / Player version. */
  variants?: ShopVariant[]
  /** Products in the same group (e.g. the 2026 jerseys) show colour swatches. */
  group?: string
  swatch?: string
}

export interface ShopVariant { label: string; price: number; note?: string }

/** Cheapest price, for "From MK …" on cards. */
export const fromPrice = (p: ShopProduct) => p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price

export interface ShopSettings {
  whatsapp?: string
  printPrice?: number
  deliveryPrice?: number
  freeDeliveryFrom?: number
  pickupPlace?: string
  bannerTitle?: string
  bannerText?: string
  bannerImage?: string
  paymentNote?: string
  /** Where fans send mobile money (shown at checkout). */
  airtelNumber?: string
  mpambaNumber?: string
  payName?: string
  /** Official logos uploaded by the club (shown at checkout). */
  airtelLogo?: string
  mpambaLogo?: string
  /** FDH Bank transfer details. */
  fdhAccount?: string
  fdhAccountName?: string
  fdhBranch?: string
  fdhLogo?: string
  /** Address of the payment server (Netlify) that sends PIN prompts through PayChangu. */
  payApi?: string
  /** 'test' (PayChangu test key: only admins see PIN payments) or 'live' (everyone). */
  payMode?: 'test' | 'live'
}

type Optional = 'bannerImage' | 'whatsapp' | 'airtelNumber' | 'mpambaNumber' | 'payName' | 'airtelLogo' | 'mpambaLogo' | 'fdhAccount' | 'fdhAccountName' | 'fdhBranch' | 'fdhLogo' | 'payApi' | 'payMode'
export const DEFAULT_SETTINGS: Required<Omit<ShopSettings, Optional>> & Pick<ShopSettings, Optional> = {
  whatsapp: '',
  printPrice: 5000,
  deliveryPrice: 3000,
  freeDeliveryFrom: 60000,
  pickupPlace: 'Mpira Stadium on match day',
  bannerTitle: 'The new Ekhaya kit',
  bannerText: 'Wear the gold. Add your name and number.',
  bannerImage: undefined,
  airtelLogo: './shop/pay-airtel.png',
  mpambaLogo: './shop/pay-tnm.png',
  fdhLogo: './shop/pay-fdh.png',
  paymentNote: 'Pay with Airtel Money, TNM Mpamba or FDH Bank.',
}

export const settingsWithDefaults = (s?: ShopSettings | null) => ({ ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v !== '' && v != null)) }) as typeof DEFAULT_SETTINGS

export const CATEGORIES: Array<{ key: ShopCategory; label: string }> = [
  { key: 'kits', label: 'Kits' },
  { key: 'training', label: 'Training' },
  { key: 'fanwear', label: 'Fanwear' },
  { key: 'accessories', label: 'Accessories' },
]

export const ADULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL']
export const KIDS_SIZES = ['4-6Y', '7-9Y', '10-12Y', '13-14Y']

export const SIZE_GUIDE: Array<[string, string, string]> = [
  ['S', '88–96 cm', '160–170 cm'],
  ['M', '96–104 cm', '170–176 cm'],
  ['L', '104–112 cm', '176–182 cm'],
  ['XL', '112–124 cm', '182–188 cm'],
  ['XXL', '124–136 cm', '188–194 cm'],
]

export const STARTER_PRODUCTS: Array<Omit<ShopProduct, 'id'>> = [
  { name: 'Home Kit 2026', category: 'kits', price: 0, sizes: [...ADULT_SIZES, ...KIDS_SIZES], personalisable: true, featured: true, badge: 'New', colour: 'home', order: 1, description: 'The official home shirt in Ekhaya gold. Add any name and number.' },
  { name: 'Away Kit 2026', category: 'kits', price: 0, sizes: [...ADULT_SIZES, ...KIDS_SIZES], personalisable: true, badge: 'New', colour: 'away', order: 2, description: 'The official away shirt in black and gold.' },
  { name: 'Training Top', category: 'training', price: 0, sizes: ADULT_SIZES, colour: 'training', order: 3, description: 'Light training top, the one the players wear in the warm-up.' },
  { name: 'Ekhaya Scarf', category: 'accessories', price: 0, sizes: [], order: 4, description: 'Gold and black supporters’ scarf for match day.' },
  { name: 'Ekhaya Cap', category: 'accessories', price: 0, sizes: [], order: 5, description: 'Black cap with the club crest.' },
  { name: 'Fan T-shirt', category: 'fanwear', price: 0, sizes: ADULT_SIZES, colour: 'third', order: 6, description: 'Cotton supporters’ T-shirt.' },
]

export const mwk = (n: number) => `MK ${Math.round(n).toLocaleString('en-US')}`

export const isPublished = (p: ShopProduct) => p.active === true && p.price > 0

// ---------- cart & wishlist (kept on this phone) ----------

export interface CartLine {
  key: string
  productId: string
  name: string
  price: number
  size: string
  variant?: string
  qty: number
  printName?: string
  printNumber?: string
  printPrice?: number
  image?: string
  colour?: ShopProduct['colour']
}

type Store = { cart: CartLine[]; wish: string[] }
const KEY = 'ekhaya-shop-v1'
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as Store; return { cart: Array.isArray(s.cart) ? s.cart : [], wish: Array.isArray(s.wish) ? s.wish : [] } } } catch { /* private mode */ }
  return { cart: [], wish: [] }
}
let store: Store = load()
const listeners = new Set<() => void>()
function set(next: Store) {
  store = next
  // Pictures are not kept on the phone: they come back from the product list.
  try { localStorage.setItem(KEY, JSON.stringify({ ...next, cart: next.cart.map((line) => { const copy = { ...line }; delete copy.image; return copy }) })) } catch { /* full or blocked */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

export function useShopStore() { return useSyncExternalStore(subscribe, () => store) }

export const newOrderRef = () => `EK-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

/** A cart line as saved with an order: no picture, no empty fields. */
export function orderLine(line: CartLine) {
  const copy: Partial<CartLine> = { ...line }
  delete copy.image; delete copy.key
  return Object.fromEntries(Object.entries(copy).filter(([, v]) => v !== undefined && v !== ''))
}

export const lineTotal = (l: CartLine) => (l.price + (l.printPrice ?? 0)) * l.qty

export function addToCart(line: Omit<CartLine, 'key' | 'qty'>, qty = 1) {
  const key = [line.productId, line.variant ?? '', line.size, line.printName ?? '', line.printNumber ?? ''].join('|')
  const found = store.cart.find((l) => l.key === key)
  set({ ...store, cart: found ? store.cart.map((l) => l.key === key ? { ...l, qty: Math.min(10, l.qty + qty) } : l) : [...store.cart, { ...line, key, qty }] })
}
export function setQty(key: string, qty: number) {
  set({ ...store, cart: qty <= 0 ? store.cart.filter((l) => l.key !== key) : store.cart.map((l) => l.key === key ? { ...l, qty: Math.min(10, qty) } : l) })
}
export function clearCart() { set({ ...store, cart: [] }) }
export function toggleWish(id: string) { set({ ...store, wish: store.wish.includes(id) ? store.wish.filter((w) => w !== id) : [...store.wish, id] }) }

export function orderText(o: { ref: string; name: string; phone: string; lines: CartLine[]; delivery: 'pickup' | 'delivery'; address?: string; deliveryFee: number; total: number; pickupPlace: string }) {
  const rows = o.lines.map((l) => `• ${l.qty} × ${l.name}${l.variant ? `, ${l.variant}` : ''}${l.size ? ` (${l.size})` : ''}${l.printName || l.printNumber ? ` – print: ${l.printName ?? ''} ${l.printNumber ?? ''}`.trimEnd() : ''} = ${mwk(lineTotal(l))}`)
  return [
    `Ekhaya FC shop order ${o.ref}`,
    ...rows,
    o.delivery === 'delivery' ? `Delivery: ${o.address ?? ''} (${o.deliveryFee ? mwk(o.deliveryFee) : 'free'})` : `Pick up: ${o.pickupPlace}`,
    `Total: ${mwk(o.total)}`,
    `Name: ${o.name} · Phone: ${o.phone}`,
  ].join('\n')
}

export function waLink(number: string, text: string) {
  const digits = number.replace(/\D/g, '').replace(/^0/, '265')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const ORDER_STATUSES = ['new', 'confirmed', 'paid', 'ready', 'collected', 'cancelled'] as const
export type OrderStatus = typeof ORDER_STATUSES[number]
export const STATUS_LABEL: Record<OrderStatus, string> = { new: 'Waiting for the club', confirmed: 'Confirmed', paid: 'Paid', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' }

export interface ShopOrder {
  id: string
  ref: string
  uid: string
  name: string
  phone: string
  lines: Array<Omit<CartLine, 'image' | 'key'>>
  delivery: 'pickup' | 'delivery'
  address?: string
  deliveryFee: number
  total: number
  status: OrderStatus
  payment?: { method: 'airtel' | 'mpamba' | 'fdh' | 'cash'; txId?: string }
  createdAt?: { toMillis?: () => number; seconds?: number } | null
}
