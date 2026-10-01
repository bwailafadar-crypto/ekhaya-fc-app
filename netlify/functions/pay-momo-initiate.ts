import { randomUUID } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { bodyFrom, firestore, jsonResponse, providerHeaders, verifyUser } from './common/payments'

const operatorReference = {
  airtel_money: '20be6c20-adeb-4b5b-a7ba-0769820df4fb',
  tnm_mpamba: '27494cb5-ba9e-437f-a114-4e7a7686bcca',
} as const

function normalizeMalawiPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const nationalNumber = digits.startsWith('265') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^[789]\d{8}$/.test(nationalNumber) ? `+265${nationalNumber}` : null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  try {
    const { uid, email } = await verifyUser(event)
    const body = bodyFrom(event)
    const tierId = typeof body.tierId === 'string' ? body.tierId.trim() : ''
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const contactEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const method = body.method === 'airtel_money' || body.method === 'tnm_mpamba' ? body.method : ''
    const phone = typeof body.phone === 'string' ? normalizeMalawiPhone(body.phone) : null
    if (!tierId || !fullName || fullName.length > 120 || !method || !phone || body.phone.length > 32 || contactEmail !== email.toLowerCase()) {
      return jsonResponse(400, { error: 'Enter your details and a valid Malawi mobile number.' })
    }

    const [tierSnapshot, membershipSnapshot] = await Promise.all([
      firestore.collection('membershipTiers').doc(tierId).get(),
      firestore.collection('memberships').doc(uid).get(),
    ])
    if (!tierSnapshot.exists || tierSnapshot.data()?.active !== true) {
      return jsonResponse(400, { error: 'This membership tier is unavailable.' })
    }
    if (membershipSnapshot.data()?.status === 'active') {
      return jsonResponse(409, { error: 'Your membership is already active.' })
    }

    const tier = tierSnapshot.data()!
    const amount = Number(tier.priceMWK)
    if (!Number.isFinite(amount) || amount <= 0) return jsonResponse(400, { error: 'This tier has an invalid price.' })

    const txRef = `ekhaya-${randomUUID()}`
    const paymentRef = firestore.collection('payments').doc(txRef)
    await paymentRef.create({
      uid,
      tierId,
      amount,
      currency: 'MWK',
      method,
      tx_ref: txRef,
      chargeId: txRef,
      status: 'pending',
      fullName,
      phone,
      email,
      createdAt: new Date(),
    })

    const nameParts = fullName.split(/\s+/)
    const response = await fetch('https://api.paychangu.com/mobile-money/payments/initialize', {
      method: 'POST',
      headers: providerHeaders(),
      body: JSON.stringify({
        mobile: phone,
        mobile_money_operator_ref_id: operatorReference[method],
        amount: String(amount),
        charge_id: txRef,
        email,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || nameParts[0],
      }),
    })
    const result = await response.json() as { status?: unknown; message?: unknown; data?: { charge_id?: unknown } | null }
    const chargeId = typeof result.data?.charge_id === 'string' || typeof result.data?.charge_id === 'number'
      ? String(result.data.charge_id)
      : ''
    if (!response.ok || String(result.status ?? '').toLowerCase() !== 'success' || !chargeId) {
      await paymentRef.update({ status: 'failed', failureReason: 'failed', updatedAt: new Date() })
      return jsonResponse(502, { error: 'Could not start the mobile money request. Check the number and try again.' })
    }

    await paymentRef.update({ chargeId, updatedAt: new Date() })
    return jsonResponse(200, { txRef })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required.') return jsonResponse(401, { error: message })
    if (message === 'A verified account email is required.') return jsonResponse(403, { error: message })
    return jsonResponse(500, { error: 'Could not start mobile money payment.' })
  }
}