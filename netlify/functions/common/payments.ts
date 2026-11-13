import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'

const PAYCHANGU_API = 'https://api.paychangu.com'

function firebaseApp() {
  if (getApps().length) return getApps()[0]
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  return initializeApp({ credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault() })
}

export const firestore = getFirestore(firebaseApp())

export function jsonResponse(statusCode: number, body: Record<string, unknown>): HandlerResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }
}

export function bodyFrom(event: HandlerEvent) {
  if (!event.body) return {} as Record<string, unknown>
  try {
    return JSON.parse(event.body) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

export async function verifyUser(event: HandlerEvent) {
  const authorization = event.headers.authorization ?? ''
  if (!authorization.startsWith('Bearer ')) throw new Error('Authentication required.')
  const decoded = await getAuth(firebaseApp()).verifyIdToken(authorization.slice(7)).catch(() => {
    throw new Error('Authentication required.')
  })
  if (!decoded.email || !decoded.email_verified) throw new Error(`A verified account email is required. [diag verified=${decoded.email_verified} email=${decoded.email ? 'set' : 'none'} provider=${(decoded.firebase && decoded.firebase.sign_in_provider) || '?'} aud=${decoded.aud} iat=${decoded.iat}]`)
  return { uid: decoded.uid, email: decoded.email }
}

export function providerHeaders() {
  const secret = process.env.PAYCHANGU_SECRET_KEY
  if (!secret || secret === 'PASTE_KEY_HERE') throw new Error('Payments are not configured on the server.')
  return { accept: 'application/json', 'content-type': 'application/json', Authorization: `Bearer ${secret}` }
}

function baseUrl(event: HandlerEvent) {
  const configuredUrl = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (configuredUrl) return new URL(configuredUrl).origin
  const protocol = event.headers['x-forwarded-proto'] || 'http'
  const host = event.headers.host || 'localhost:8888'
  return `${protocol}://${host}`
}

export function checkoutUrls(event: HandlerEvent, txRef: string) {
  const origin = baseUrl(event)
  return {
    callback_url: `${origin}/.netlify/functions/pay-webhook`,
    return_url: `${origin}/#/membership?tx_ref=${encodeURIComponent(txRef)}`,
  }
}

function mobileMoneyFailureReason(message: string, status: string) {
  const detail = `${status} ${message}`.toLowerCase()
  if (/pin|passcode|authentication/.test(detail)) return 'wrong_pin' as const
  if (/cancel|declin/.test(detail)) return 'cancelled' as const
  if (/time.?out|expired|timeout/.test(detail)) return 'timeout' as const
  return 'failed' as const
}

async function verifiedProviderPayment(txRef: string, paymentData: Record<string, unknown>) {
  if (paymentData.method === 'airtel_money' || paymentData.method === 'tnm_mpamba') {
    const chargeId = String(paymentData.chargeId ?? '')
    if (!chargeId) throw new Error('Direct charge reference is missing.')
    const response = await fetch(`${PAYCHANGU_API}/mobile-money/payments/${encodeURIComponent(chargeId)}/verify`, {
      method: 'GET',
      headers: providerHeaders(),
    })
    if (!response.ok) throw new Error('Could not verify payment with PayChangu.')
    const payload = await response.json() as { status?: unknown; message?: unknown; data?: Record<string, unknown> | null }
    const details = payload.data ?? {}
    const status = String(details.status ?? payload.status ?? '').toLowerCase()
    const message = String(payload.message ?? details.message ?? '')
    if (['failed', 'cancelled', 'canceled', 'rejected', 'expired', 'timeout', 'timed_out'].includes(status)) {
      return { status: 'failed' as const, failureReason: mobileMoneyFailureReason(message, status) }
    }
    if (!['success', 'successful', 'paid', 'completed'].includes(status)) return { status: 'pending' as const }
    return {
      status: 'paid' as const,
      amount: Number(details.amount ?? details.charge ?? details.total_amount),
      currency: String(details.currency ?? '').toUpperCase(),
    }
  }

  const response = await fetch(`${PAYCHANGU_API}/verify-payment/${encodeURIComponent(txRef)}`, {
    method: 'GET',
    headers: providerHeaders(),
  })
  if (!response.ok) throw new Error('Could not verify payment with PayChangu.')
  const payload = await response.json() as { status?: unknown; data?: Record<string, unknown> }
  if (String(payload.status ?? '').toLowerCase() !== 'success' || !payload.data) {
    throw new Error('PayChangu did not confirm this payment.')
  }
  const details = payload.data
  const returnedRef = String(details.tx_ref ?? details.reference ?? '')
  if (returnedRef && returnedRef !== txRef) throw new Error('PayChangu returned a different reference.')

  const status = String(details.status ?? '').toLowerCase()
  if (['failed', 'cancelled', 'canceled', 'rejected'].includes(status)) return { status: 'failed' as const }
  if (!['success', 'successful', 'paid', 'completed'].includes(status)) return { status: 'pending' as const }

  const amount = Number(details.amount ?? details.charge ?? details.total_amount)
  const currency = String(details.currency ?? '').toUpperCase()
  return { status: 'paid' as const, amount, currency }
}

function fanIdNumber(value: unknown) {
  if (typeof value !== 'string') return 0
  const match = value.match(/^EKH-FAN-(\d+)$/)
  return match ? Number(match[1]) : 0
}

async function highestExistingFanNumber() {
  const [fans, memberships] = await Promise.all([
    firestore.collection('fans').select('fanId').get(),
    firestore.collection('memberships').select('fanId').get(),
  ])
  return [...fans.docs, ...memberships.docs].reduce((highest, item) => Math.max(highest, fanIdNumber(item.data().fanId)), 0)
}

function expiryAfterMonths(start: Date, durationMonths: number) {
  const expiry = new Date(start)
  const day = expiry.getDate()
  expiry.setDate(1)
  expiry.setMonth(expiry.getMonth() + Math.max(1, durationMonths))
  expiry.setDate(Math.min(day, new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0).getDate()))
  return expiry
}

export async function verifyAndActivate(txRef: string, expectedUid?: string) {
  const paymentRef = firestore.collection('payments').doc(txRef)
  const initialPayment = await paymentRef.get()
  if (!initialPayment.exists) throw new Error('Payment reference was not found.')
  const initialData = initialPayment.data()!
  if (expectedUid && initialData.uid !== expectedUid) throw new Error('This payment does not belong to your account.')
  if (initialData.status === 'paid') return { status: 'paid' as const }

  const provider = await verifiedProviderPayment(txRef, initialData)
  if (provider.status !== 'paid') {
    if (provider.status === 'failed') {
      await firestore.runTransaction(async (transaction) => {
        const payment = await transaction.get(paymentRef)
        if (payment.exists && payment.data()?.status === 'pending') {
          transaction.update(paymentRef, { status: 'failed', updatedAt: FieldValue.serverTimestamp() })
        }
      })
    }
    return provider
  }
  if (!['MWK', 'MK'].includes(provider.currency) || provider.amount !== Number(initialData.amount)) {
    throw new Error('Verified payment amount or currency does not match.')
  }

  const tierRef = firestore.collection('membershipTiers').doc(String(initialData.tierId))
  const membershipRef = firestore.collection('memberships').doc(String(initialData.uid))
  const userRef = firestore.collection('users').doc(String(initialData.uid))
  const counterRef = firestore.collection('settings').doc('fanIdCounter')
  const counterSnapshot = await counterRef.get()
  const storedLastNumber = Number(counterSnapshot.data()?.lastNumber ?? 0)
  const knownNumber = counterSnapshot.exists && Number.isSafeInteger(storedLastNumber) && storedLastNumber >= 0
    ? storedLastNumber
    : await highestExistingFanNumber()
  const startDate = new Date()

  return firestore.runTransaction(async (transaction) => {
    const [payment, tier, membership, counter, user] = await Promise.all([
      transaction.get(paymentRef),
      transaction.get(tierRef),
      transaction.get(membershipRef),
      transaction.get(counterRef),
      transaction.get(userRef),
    ])
    if (!payment.exists) throw new Error('Payment reference was not found.')
    const paymentData = payment.data()!
    if (expectedUid && paymentData.uid !== expectedUid) throw new Error('This payment does not belong to your account.')
    if (paymentData.status === 'paid') return { status: 'paid' as const }
    if (paymentData.status !== 'pending') throw new Error('This payment is no longer pending.')
    if (!tier.exists || tier.data()?.active !== true) throw new Error('Membership tier is no longer active.')
    if (Number(tier.data()?.priceMWK) !== Number(paymentData.amount)) throw new Error('Membership tier price changed during checkout.')

    const membershipData = membership.data()
    const legacyFanDocId = user.data()?.legacyFanDocId
    const legacyFanRef = typeof legacyFanDocId === 'string' ? firestore.collection('fans').doc(legacyFanDocId) : null
    const legacyFan = legacyFanRef ? await transaction.get(legacyFanRef) : null
    const linkedFans = legacyFan?.exists ? [legacyFan] : []
    const linkedFanId = linkedFans.find((fan) => typeof fan.data()?.fanId === 'string')?.data()?.fanId
    const existingFanId = typeof membershipData?.fanId === 'string'
      ? membershipData.fanId
      : typeof linkedFanId === 'string' ? linkedFanId : undefined
    const counterNumber = Number(counter.data()?.lastNumber ?? 0)
    const lastNumber = Math.max(Number.isSafeInteger(counterNumber) && counterNumber >= 0 ? counterNumber : 0, knownNumber, fanIdNumber(existingFanId))
    const fanId = existingFanId ?? `EKH-FAN-${String(lastNumber + 1).padStart(6, '0')}`
    const now = startDate
    const expiryDate = expiryAfterMonths(now, Number(tier.data()?.durationMonths ?? 12))

    transaction.set(counterRef, { lastNumber: Math.max(lastNumber, fanIdNumber(fanId)), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    transaction.set(membershipRef, {
      uid: paymentData.uid,
      tierId: paymentData.tierId,
      fullName: paymentData.fullName,
      phone: paymentData.phone,
      email: paymentData.email,
      status: 'active',
      fanId,
      startDate: Timestamp.fromDate(now),
      expiryDate: Timestamp.fromDate(expiryDate),
      createdAt: membershipData?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    linkedFans.forEach((fan) => transaction.update(fan.ref, {
      tier: tier.data()?.name,
      status: 'active',
      fanId,
      memberSince: now.toISOString().slice(0, 10),
      expiryDate: expiryDate.toISOString().slice(0, 10),
      updatedAt: FieldValue.serverTimestamp(),
    }))
    transaction.update(paymentRef, { status: 'paid', paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    return { status: 'paid' as const, fanId }
  })
}

export function methodNotAllowed(event: HandlerEvent): HandlerResponse | null {
  return event.httpMethod === 'POST' ? null : jsonResponse(405, { error: 'Method not allowed.' })
}

export function isTransactionReference(value: unknown): value is string {
  return typeof value === 'string' && /^ekhaya-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}