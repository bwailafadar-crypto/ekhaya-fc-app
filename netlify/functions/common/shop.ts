// Club shop payments through PayChangu (Airtel Money / TNM Mpamba direct
// charge: the fan gets a PIN prompt on their phone). The server works out the
// price itself from the products and shop settings, so an order can never be
// paid for less than it costs, and an order only turns "paid" after PayChangu
// confirms the money with the same amount.
import { randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { firestore, providerHeaders } from './payments'

const PAYCHANGU_API = 'https://api.paychangu.com'
export const OPERATOR: Record<'airtel' | 'mpamba', string> = {
  airtel: '20be6c20-adeb-4b5b-a7ba-0769820df4fb',
  mpamba: '27494cb5-ba9e-437f-a114-4e7a7686bcca',
}
const DEFAULTS = { printPrice: 5000, deliveryPrice: 3000, freeDeliveryFrom: 60000 }

/** Only the club's own app may call these from a browser: the live site, its
 * preview channels, the Android app and local development. Any other website is refused. */
const ALLOWED_ORIGIN = /^(https:\/\/ekhaya-fc-app(--[a-z0-9-]+)?\.(web\.app|firebaseapp\.com)|https?:\/\/localhost(:\d+)?)$/
export const allowedOrigin = (origin: unknown) => typeof origin === 'string' && ALLOWED_ORIGIN.test(origin)
export function cors(event: HandlerEvent, response: HandlerResponse): HandlerResponse {
  const origin = event.headers.origin ?? event.headers.Origin
  const allow: Record<string, string> = allowedOrigin(origin) ? { 'access-control-allow-origin': String(origin), 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' } : {}
  return { ...response, headers: { ...response.headers, ...allow, vary: 'Origin' } }
}
export const preflight = (event: HandlerEvent) => event.httpMethod === 'OPTIONS' ? cors(event, { statusCode: allowedOrigin(event.headers.origin ?? event.headers.Origin) ? 204 : 403, body: '' }) : null
/** A browser call from another website is refused before anything happens. */
export const foreignSite = (event: HandlerEvent) => { const o = event.headers.origin ?? event.headers.Origin; return o != null && !allowedOrigin(o) }

/** At most 3 PIN requests per fan in 10 minutes, 30 seconds apart, so nobody can
 * flood a phone with payment prompts. Kept on the server only (fans can't read it). */
async function payLimit(uid: string) {
  const ref = firestore.collection('payLimits').doc(uid)
  await firestore.runTransaction(async (t) => {
    const now = Date.now()
    const recent = ((await t.get(ref)).data()?.starts as number[] | undefined ?? []).filter((at) => now - at < 10 * 60_000)
    if (recent.length >= 3) throw new Error('Too many payment requests. Please wait 10 minutes and try again.')
    if (recent.some((at) => now - at < 30_000)) throw new Error('Please wait 30 seconds before asking for another PIN prompt.')
    t.set(ref, { starts: [...recent, now], updatedAt: FieldValue.serverTimestamp() })
  })
}

export function normalizeMalawiPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const national = digits.startsWith('265') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^[789]\d{8}$/.test(national) ? `+265${national}` : null
}

export const isShopRef = (value: unknown): value is string => typeof value === 'string' && /^ekshop-[0-9a-f-]{36}$/i.test(value)

type Line = { productId?: string; price?: number; variant?: string; size?: string; qty?: number; printName?: string; printNumber?: string; printPrice?: number }

/** The real price of an order, from today's products and settings. */
export async function priceOrder(order: { lines?: Line[]; delivery?: string }) {
  const settings = { ...DEFAULTS, ...((await firestore.collection('shopSettings').doc('main').get()).data() ?? {}) }
  let subtotal = 0
  for (const line of order.lines ?? []) {
    const qty = Math.floor(Number(line.qty))
    if (!line.productId || !(qty >= 1 && qty <= 10)) throw new Error('An item in the order is not valid.')
    const product = (await firestore.collection('shopProducts').doc(line.productId).get()).data() ?? (await firestore.collection('shopProductsStaff').doc(line.productId).get()).data()
    if (!product || product.active !== true || product.soldOut === true) throw new Error('An item in the order is no longer for sale.')
    const variants = Array.isArray(product.variants) ? product.variants as Array<{ label: string; price: number }> : []
    const unit = variants.length > 1 ? Number(variants.find((v) => v.label === line.variant)?.price) : Number(variants[0]?.price ?? product.price)
    if (!(unit > 0)) throw new Error('An item in the order has no price.')
    const printing = Boolean(line.printName || line.printNumber) ? Number(settings.printPrice) || 0 : 0
    subtotal += (unit + printing) * qty
  }
  const fee = order.delivery === 'delivery' && subtotal < Number(settings.freeDeliveryFrom) ? Number(settings.deliveryPrice) || 0 : 0
  return subtotal + fee
}

/** Starts the PIN prompt on the fan's phone for one of their orders. */
export async function startShopPayment(uid: string, email: string, orderId: string, method: 'airtel' | 'mpamba', phoneInput: string) {
  const phone = normalizeMalawiPhone(phoneInput)
  if (!phone) throw new Error('Enter a valid Malawi mobile number.')
  const orderRef = firestore.collection('shopOrders').doc(orderId)
  const order = (await orderRef.get()).data()
  if (!order || order.uid !== uid) throw new Error('Order not found.')
  if (order.status !== 'new') throw new Error('This order is already being handled.')
  const amount = await priceOrder(order)
  if (amount !== Number(order.total)) throw new Error('Prices changed. Please make the order again.')
  await payLimit(uid)

  const txRef = `ekshop-${randomUUID()}`
  const payRef = firestore.collection('shopPayments').doc(txRef)
  await payRef.create({ uid, orderId, ref: order.ref, amount, currency: 'MWK', method, phone, status: 'pending', chargeId: txRef, createdAt: FieldValue.serverTimestamp() })
  const names = String(order.name ?? 'Ekhaya Fan').trim().split(/\s+/)
  const response = await fetch(`${PAYCHANGU_API}/mobile-money/payments/initialize`, {
    method: 'POST',
    headers: providerHeaders(),
    body: JSON.stringify({ mobile: phone, mobile_money_operator_ref_id: OPERATOR[method], amount: String(amount), charge_id: txRef, email, first_name: names[0], last_name: names.slice(1).join(' ') || names[0] }),
  })
  const result = await response.json().catch(() => ({})) as { status?: unknown; message?: unknown; data?: { charge_id?: unknown } | null }
  const chargeId = result.data?.charge_id != null ? String(result.data.charge_id) : ''
  if (!response.ok || String(result.status ?? '').toLowerCase() !== 'success' || !chargeId) {
    await payRef.update({ status: 'failed', failureReason: String(result.message ?? 'not started').slice(0, 200), updatedAt: FieldValue.serverTimestamp() })
    throw new Error('Could not send the PIN request. Check the number and try again.')
  }
  await payRef.update({ chargeId, updatedAt: FieldValue.serverTimestamp() })
  await orderRef.update({ payment: { method, provider: 'paychangu', txRef, status: 'pending', phone: phone.replace('+265', '0') }, updatedAt: FieldValue.serverTimestamp() })
  return txRef
}

function reason(text: string) {
  const t = text.toLowerCase()
  if (/pin|passcode|authenticat/.test(t)) return 'wrong_pin'
  if (/insufficient|balance|funds/.test(t)) return 'no_balance'
  if (/cancel|declin|reject/.test(t)) return 'cancelled'
  if (/time.?out|expired/.test(t)) return 'timeout'
  return 'failed'
}

/** Asks PayChangu whether the money arrived; marks the order paid when it did. */
export async function checkShopPayment(txRef: string, expectedUid?: string) {
  const payRef = firestore.collection('shopPayments').doc(txRef)
  const pay = (await payRef.get()).data()
  if (!pay) throw new Error('Payment not found.')
  if (expectedUid && pay.uid !== expectedUid) throw new Error('Payment not found.')
  if (pay.status === 'paid' || pay.status === 'failed') return { status: pay.status as string, reason: pay.failureReason as string | undefined }

  const response = await fetch(`${PAYCHANGU_API}/mobile-money/payments/${encodeURIComponent(String(pay.chargeId))}/verify`, { headers: providerHeaders() })
  if (!response.ok) return { status: 'pending' }
  const body = await response.json().catch(() => ({})) as { status?: unknown; message?: unknown; data?: Record<string, unknown> | null }
  const data = body.data ?? {}
  const status = String(data.status ?? body.status ?? '').toLowerCase()
  const message = String(body.message ?? data.message ?? '')
  if (['failed', 'cancelled', 'canceled', 'rejected', 'expired', 'timeout', 'timed_out'].includes(status)) {
    const why = reason(`${status} ${message}`)
    await payRef.update({ status: 'failed', failureReason: why, updatedAt: FieldValue.serverTimestamp() })
    await firestore.collection('shopOrders').doc(String(pay.orderId)).update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined)
    return { status: 'failed', reason: why }
  }
  if (!['success', 'successful', 'paid', 'completed'].includes(status)) return { status: 'pending' }
  const amount = Number(data.amount ?? data.charge ?? data.total_amount)
  const currency = String(data.currency ?? 'MWK').toUpperCase()
  if (amount !== Number(pay.amount) || !['MWK', 'MK'].includes(currency)) {
    await payRef.update({ status: 'review', note: `PayChangu said ${currency} ${amount}`, updatedAt: FieldValue.serverTimestamp() })
    return { status: 'review' }
  }
  const tx = String(data.trans_id ?? data.ref_id ?? data.reference ?? pay.chargeId).slice(0, 40)
  await firestore.runTransaction(async (t) => {
    const orderRef = firestore.collection('shopOrders').doc(String(pay.orderId))
    const order = await t.get(orderRef)
    t.update(payRef, { status: 'paid', transId: tx, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    if (order.exists && ['new', 'confirmed'].includes(String(order.data()?.status))) {
      t.update(orderRef, { status: 'paid', payment: { ...(order.data()?.payment ?? {}), method: pay.method, provider: 'paychangu', txRef, status: 'paid', txId: tx }, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    }
  })
  return { status: 'paid' }
}

/** A PayChangu callback may name the payment by our reference or by their charge id. */
export async function findShopRef(candidates: unknown[]) {
  for (const value of candidates) {
    if (isShopRef(value)) return value
    if (typeof value === 'string' || typeof value === 'number') {
      const found = await firestore.collection('shopPayments').where('chargeId', '==', String(value)).limit(1).get()
      if (!found.empty) return found.docs[0].id
    }
  }
  return null
}
