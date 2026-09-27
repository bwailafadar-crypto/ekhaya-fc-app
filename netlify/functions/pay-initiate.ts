import { randomUUID } from 'node:crypto'
import type { Handler } from '@netlify/functions'
import { bodyFrom, checkoutUrls, firestore, jsonResponse, providerHeaders, verifyUser } from './common/payments'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  try {
    const { uid, email } = await verifyUser(event)
    const body = bodyFrom(event)
    const tierId = typeof body.tierId === 'string' ? body.tierId.trim() : ''
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const contactEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!tierId || !fullName || !phone || contactEmail !== email.toLowerCase()) {
      return jsonResponse(400, { error: 'Complete your contact details using your verified account email.' })
    }

    const tierRef = firestore.collection('membershipTiers').doc(tierId)
    const [tierSnapshot, membershipSnapshot] = await Promise.all([
      tierRef.get(),
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
    const urls = checkoutUrls(event, txRef)
    await paymentRef.create({
      uid,
      tierId,
      amount,
      currency: 'MWK',
      tx_ref: txRef,
      status: 'pending',
      fullName,
      phone,
      email,
      createdAt: new Date(),
    })

    const nameParts = fullName.split(/\s+/)
    const checkoutResponse = await fetch('https://api.paychangu.com/payment', {
      method: 'POST',
      headers: providerHeaders(),
      body: JSON.stringify({
        amount: String(amount),
        currency: 'MWK',
        email,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || nameParts[0],
        tx_ref: txRef,
        ...urls,
        customization: { title: 'Ekhaya FC Membership', description: `${tier.name} membership` },
      }),
    })
    const result = await checkoutResponse.json() as { status?: unknown; message?: unknown; data?: { checkout_url?: unknown } }
    const checkoutUrl = typeof result.data?.checkout_url === 'string' ? result.data.checkout_url : ''
    if (!checkoutResponse.ok || String(result.status ?? '').toLowerCase() !== 'success' || !checkoutUrl.startsWith('https://')) {
      await paymentRef.update({ status: 'failed', updatedAt: new Date() })
      return jsonResponse(502, { error: 'PayChangu could not start checkout. Please try again.' })
    }

    await paymentRef.update({ checkoutUrl, updatedAt: new Date() })
    return jsonResponse(200, { checkoutUrl, txRef })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required.') return jsonResponse(401, { error: message })
    if (message === 'A verified account email is required.') return jsonResponse(403, { error: message })
    return jsonResponse(500, { error: 'Could not start membership checkout.' })
  }
}