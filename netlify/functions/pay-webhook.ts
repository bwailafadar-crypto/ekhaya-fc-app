import type { Handler } from '@netlify/functions'
import { bodyFrom, isTransactionReference, jsonResponse, verifyAndActivate } from './common/payments'
import { checkShopPayment, findShopRef } from './common/shop'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  const body = bodyFrom(event)
  const data = typeof body.data === 'object' && body.data !== null
    ? body.data as Record<string, unknown>
    : {}
  const txRef = body.tx_ref ?? body.reference ?? data.tx_ref ?? data.reference
  // Shop orders (PIN payments): PayChangu may name them by our reference or their charge id.
  const shopRef = await findShopRef([txRef, body.charge_id, data.charge_id]).catch(() => null)
  if (shopRef) {
    try { return jsonResponse(200, { received: true, ...(await checkShopPayment(shopRef)) }) }
    catch { return jsonResponse(502, { error: 'Payment confirmation is pending verification.' }) }
  }
  if (!isTransactionReference(txRef)) return jsonResponse(400, { error: 'Payment reference is invalid.' })

  try {
    const result = await verifyAndActivate(txRef)
    return jsonResponse(200, { received: true, status: result.status })
  } catch {
    return jsonResponse(502, { error: 'Payment confirmation is pending verification.' })
  }
}