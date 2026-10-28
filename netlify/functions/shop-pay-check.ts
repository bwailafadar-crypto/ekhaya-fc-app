// The app asks every few seconds whether the fan has entered their PIN.
import type { Handler } from '@netlify/functions'
import { bodyFrom, jsonResponse, verifyUser } from './common/payments'
import { checkShopPayment, cors, foreignSite, isShopRef, preflight } from './common/shop'

export const handler: Handler = async (event) => {
  const early = preflight(event); if (early) return early
  if (foreignSite(event)) return cors(event, jsonResponse(403, { error: 'Not allowed.' }))
  if (event.httpMethod !== 'POST') return cors(event, jsonResponse(405, { error: 'Method not allowed.' }))
  try {
    const { uid } = await verifyUser(event)
    const txRef = bodyFrom(event).txRef
    if (!isShopRef(txRef)) return cors(event, jsonResponse(400, { error: 'Payment reference is invalid.' }))
    return cors(event, jsonResponse(200, await checkShopPayment(txRef, uid)))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required.') return cors(event, jsonResponse(401, { error: message }))
    return cors(event, jsonResponse(200, { status: 'pending' }))
  }
}
