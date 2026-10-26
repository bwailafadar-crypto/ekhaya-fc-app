// The app asks every few seconds whether the fan has entered their PIN.
import type { Handler } from '@netlify/functions'
import { bodyFrom, jsonResponse, verifyUser } from './common/payments'
import { checkShopPayment, cors, isShopRef, preflight } from './common/shop'

export const handler: Handler = async (event) => {
  const early = preflight(event); if (early) return early
  if (event.httpMethod !== 'POST') return cors(jsonResponse(405, { error: 'Method not allowed.' }))
  try {
    const { uid } = await verifyUser(event)
    const txRef = bodyFrom(event).txRef
    if (!isShopRef(txRef)) return cors(jsonResponse(400, { error: 'Payment reference is invalid.' }))
    return cors(jsonResponse(200, await checkShopPayment(txRef, uid)))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required.') return cors(jsonResponse(401, { error: message }))
    return cors(jsonResponse(200, { status: 'pending' }))
  }
}
