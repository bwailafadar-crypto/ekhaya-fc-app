// The fan taps "Pay now": PayChangu sends the PIN prompt to their phone.
import type { Handler } from '@netlify/functions'
import { bodyFrom, jsonResponse, verifyUser } from './common/payments'
import { cors, foreignSite, preflight, startShopPayment } from './common/shop'

export const handler: Handler = async (event) => {
  const early = preflight(event); if (early) return early
  if (foreignSite(event)) return cors(event, jsonResponse(403, { error: 'Not allowed.' }))
  if (event.httpMethod !== 'POST') return cors(event, jsonResponse(405, { error: 'Method not allowed.' }))
  try {
    const { uid, email } = await verifyUser(event)
    const body = bodyFrom(event)
    const method = body.method === 'airtel' || body.method === 'mpamba' ? body.method : null
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    const phone = typeof body.phone === 'string' ? body.phone.slice(0, 32) : ''
    if (!method || !orderId || !phone) return cors(event, jsonResponse(400, { error: 'Choose Airtel Money or TNM Mpamba and enter the number to pay from.' }))
    const txRef = await startShopPayment(uid, email, orderId, method, phone)
    return cors(event, jsonResponse(200, { txRef }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the payment.'
    const code = message === 'Authentication required.' ? 401 : message.startsWith('A verified account email is required.') ? 403 : message.includes('configured') ? 503 : 400
    return cors(event, jsonResponse(code, { error: code === 503 ? 'Mobile money payments are not switched on yet.' : message }))
  }
}
