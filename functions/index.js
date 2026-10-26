// Ekhaya FC payment server (Firebase): club shop PIN payments through
// PayChangu (Airtel Money / TNM Mpamba direct charge: the fan gets a PIN
// prompt on their phone). The server works out the price itself from the
// products and shop settings, so an order can never be paid for less than it
// costs, and an order only turns "paid" after PayChangu confirms the money.
//   shopPayStart   - app: start the PIN prompt for one of the fan's orders
//   shopPayCheck   - app: has the fan paid yet?
//   shopPayWebhook - PayChangu: "a payment changed" (we then ask PayChangu ourselves)
// The PayChangu secret key comes from the PAYCHANGU_SECRET_KEY setting, which the
// deploy job writes from the GitHub secret of the same name.
const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { randomUUID } = require('node:crypto')

initializeApp()
const db = getFirestore()
setGlobalOptions({ region: 'europe-west1', maxInstances: 5, memory: '256MiB' })

const PAYCHANGU = 'https://api.paychangu.com'
const OPERATOR = { airtel: '20be6c20-adeb-4b5b-a7ba-0769820df4fb', mpamba: '27494cb5-ba9e-437f-a114-4e7a7686bcca' }
const DEFAULTS = { printPrice: 5000, deliveryPrice: 3000, freeDeliveryFrom: 60000 }

function providerHeaders() {
  const secret = (process.env.PAYCHANGU_SECRET_KEY || '').trim()
  if (!secret) throw Object.assign(new Error('Mobile money payments are not switched on yet.'), { code: 503 })
  return { accept: 'application/json', 'content-type': 'application/json', Authorization: `Bearer ${secret}` }
}

async function fanFrom(req) {
  const header = req.get('authorization') || ''
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Please sign in again.'), { code: 401 })
  const user = await getAuth().verifyIdToken(header.slice(7)).catch(() => null)
  if (!user) throw Object.assign(new Error('Please sign in again.'), { code: 401 })
  return user
}

const phoneOf = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  const national = digits.startsWith('265') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^[789]\d{8}$/.test(national) ? `+265${national}` : null
}
const isShopRef = (v) => typeof v === 'string' && /^ekshop-[0-9a-f-]{36}$/i.test(v)

/** The real price of an order, from today's products and settings. */
async function priceOrder(order) {
  const settings = { ...DEFAULTS, ...((await db.collection('shopSettings').doc('main').get()).data() || {}) }
  let subtotal = 0
  for (const line of order.lines || []) {
    const qty = Math.floor(Number(line.qty))
    if (!line.productId || !(qty >= 1 && qty <= 10)) throw Object.assign(new Error('An item in the order is not valid.'), { code: 400 })
    const product = (await db.collection('shopProducts').doc(line.productId).get()).data() || (await db.collection('shopProductsStaff').doc(line.productId).get()).data()
    if (!product || product.active !== true || product.soldOut === true) throw Object.assign(new Error('An item in the order is no longer for sale.'), { code: 400 })
    const variants = Array.isArray(product.variants) ? product.variants : []
    const unit = variants.length > 1 ? Number((variants.find((v) => v.label === line.variant) || {}).price) : Number(variants[0] ? variants[0].price : product.price)
    if (!(unit > 0)) throw Object.assign(new Error('An item in the order has no price.'), { code: 400 })
    const printing = line.printName || line.printNumber ? Number(settings.printPrice) || 0 : 0
    subtotal += (unit + printing) * qty
  }
  const fee = order.delivery === 'delivery' && subtotal < Number(settings.freeDeliveryFrom) ? Number(settings.deliveryPrice) || 0 : 0
  return subtotal + fee
}

function reason(text) {
  const t = String(text).toLowerCase()
  if (/pin|passcode|authenticat/.test(t)) return 'wrong_pin'
  if (/insufficient|balance|funds/.test(t)) return 'no_balance'
  if (/cancel|declin|reject/.test(t)) return 'cancelled'
  if (/time.?out|expired/.test(t)) return 'timeout'
  return 'failed'
}

/** Asks PayChangu whether the money arrived; marks the order paid when it did. */
async function checkPayment(txRef, expectedUid) {
  const payRef = db.collection('shopPayments').doc(txRef)
  const pay = (await payRef.get()).data()
  if (!pay || (expectedUid && pay.uid !== expectedUid)) throw Object.assign(new Error('Payment not found.'), { code: 404 })
  if (pay.status === 'paid' || pay.status === 'failed') return { status: pay.status, reason: pay.failureReason }

  const response = await fetch(`${PAYCHANGU}/mobile-money/payments/${encodeURIComponent(String(pay.chargeId))}/verify`, { headers: providerHeaders() })
  if (!response.ok) return { status: 'pending' }
  const body = await response.json().catch(() => ({}))
  const data = body.data || {}
  const status = String(data.status || body.status || '').toLowerCase()
  const message = String(body.message || data.message || '')
  if (['failed', 'cancelled', 'canceled', 'rejected', 'expired', 'timeout', 'timed_out'].includes(status)) {
    const why = reason(`${status} ${message}`)
    await payRef.update({ status: 'failed', failureReason: why, updatedAt: FieldValue.serverTimestamp() })
    await db.collection('shopOrders').doc(String(pay.orderId)).update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined)
    return { status: 'failed', reason: why }
  }
  if (!['success', 'successful', 'paid', 'completed'].includes(status)) return { status: 'pending' }
  const amount = Number(data.amount ?? data.charge ?? data.total_amount)
  const currency = String(data.currency || 'MWK').toUpperCase()
  if (amount !== Number(pay.amount) || !['MWK', 'MK'].includes(currency)) {
    await payRef.update({ status: 'review', note: `PayChangu said ${currency} ${amount}`, updatedAt: FieldValue.serverTimestamp() })
    return { status: 'review' }
  }
  const tx = String(data.trans_id || data.ref_id || data.reference || pay.chargeId).slice(0, 40)
  await db.runTransaction(async (t) => {
    const orderRef = db.collection('shopOrders').doc(String(pay.orderId))
    const order = await t.get(orderRef)
    t.update(payRef, { status: 'paid', transId: tx, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    if (order.exists && ['new', 'confirmed'].includes(String(order.data().status))) {
      t.update(orderRef, { status: 'paid', payment: { ...(order.data().payment || {}), method: pay.method, provider: 'paychangu', txRef, status: 'paid', txId: tx }, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    }
  })
  return { status: 'paid' }
}

const fail = (res, error) => res.status(error.code || 500).json({ error: error.code ? error.message : 'Something went wrong. Try again.' })

exports.shopPayStart = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  try {
    const user = await fanFrom(req)
    const { orderId, method, phone: phoneInput } = req.body || {}
    if (method !== 'airtel' && method !== 'mpamba') return res.status(400).json({ error: 'Choose Airtel Money or TNM Mpamba.' })
    const phone = phoneOf(phoneInput)
    if (!phone) return res.status(400).json({ error: 'Enter a valid Malawi mobile number.' })
    const orderRef = db.collection('shopOrders').doc(String(orderId || ''))
    const order = (await orderRef.get()).data()
    if (!order || order.uid !== user.uid) return res.status(404).json({ error: 'Order not found.' })
    if (order.status !== 'new') return res.status(409).json({ error: 'This order is already being handled.' })
    const amount = await priceOrder(order)
    if (amount !== Number(order.total)) return res.status(409).json({ error: 'Prices changed. Please make the order again.' })

    const txRef = `ekshop-${randomUUID()}`
    const payRef = db.collection('shopPayments').doc(txRef)
    await payRef.create({ uid: user.uid, orderId: orderRef.id, ref: order.ref, amount, currency: 'MWK', method, phone, status: 'pending', chargeId: txRef, createdAt: FieldValue.serverTimestamp() })
    const names = String(order.name || 'Ekhaya Fan').trim().split(/\s+/)
    const response = await fetch(`${PAYCHANGU}/mobile-money/payments/initialize`, {
      method: 'POST',
      headers: providerHeaders(),
      body: JSON.stringify({ mobile: phone, mobile_money_operator_ref_id: OPERATOR[method], amount: String(amount), charge_id: txRef, email: user.email || undefined, first_name: names[0], last_name: names.slice(1).join(' ') || names[0] }),
    })
    const result = await response.json().catch(() => ({}))
    const chargeId = result.data && result.data.charge_id != null ? String(result.data.charge_id) : ''
    if (!response.ok || String(result.status || '').toLowerCase() !== 'success' || !chargeId) {
      await payRef.update({ status: 'failed', failureReason: String(result.message || 'not started').slice(0, 200), updatedAt: FieldValue.serverTimestamp() })
      return res.status(502).json({ error: 'Could not send the PIN request. Check the number and try again.' })
    }
    await payRef.update({ chargeId, updatedAt: FieldValue.serverTimestamp() })
    await orderRef.update({ payment: { method, provider: 'paychangu', txRef, status: 'pending', phone: phone.replace('+265', '0') }, updatedAt: FieldValue.serverTimestamp() })
    return res.json({ txRef })
  } catch (error) { return fail(res, error) }
})

exports.shopPayCheck = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  try {
    const user = await fanFrom(req)
    const txRef = (req.body || {}).txRef
    if (!isShopRef(txRef)) return res.status(400).json({ error: 'Payment reference is invalid.' })
    return res.json(await checkPayment(txRef, user.uid))
  } catch (error) { return error.code === 401 ? fail(res, error) : res.json({ status: 'pending' }) }
})

// PayChangu calls this when a payment changes. We never trust what the call
// says: we look the payment up and ask PayChangu ourselves.
exports.shopPayWebhook = onRequest(async (req, res) => {
  const body = req.body || {}
  const data = body.data || {}
  const candidates = [body.charge_id, data.charge_id, body.tx_ref, data.tx_ref, body.reference, data.reference].filter((v) => v != null)
  try {
    for (const value of candidates) {
      let ref = isShopRef(value) ? value : null
      if (!ref) { const found = await db.collection('shopPayments').where('chargeId', '==', String(value)).limit(1).get(); if (!found.empty) ref = found.docs[0].id }
      if (ref) return res.json({ received: true, ...(await checkPayment(ref)) })
    }
    return res.json({ received: true, ignored: true })
  } catch { return res.status(502).json({ error: 'Will be checked again.' }) }
})
