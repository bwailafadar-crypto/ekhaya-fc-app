import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Handler, HandlerEvent } from '@netlify/functions'
import { bodyFrom, isTransactionReference, jsonResponse, verifyAndActivate } from './common/payments'
import { checkShopPayment, findShopRef } from './common/shop'

/** PayChangu signs each webhook (HMAC-SHA256 of the body, "Signature" header)
 *  with the webhook secret from its dashboard. When the secret is set here,
 *  calls without the right signature are refused at once. (Either way, a
 *  payment is only accepted after asking PayChangu ourselves.) */
function signatureOk(event: HandlerEvent) {
  const secret = (process.env.PAYCHANGU_WEBHOOK_SECRET || '').trim()
  if (!secret) return true
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8')
  const given = String(event.headers.signature || event.headers.Signature || '').trim().toLowerCase()
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })
  if (!signatureOk(event)) return jsonResponse(401, { error: 'Bad signature.' })

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