import type { Handler } from '@netlify/functions'
import { bodyFrom, isTransactionReference, jsonResponse, verifyAndActivate, verifyUser } from './common/payments'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  try {
    const { uid } = await verifyUser(event)
    const txRef = bodyFrom(event).txRef
    if (!isTransactionReference(txRef)) return jsonResponse(400, { error: 'Payment reference is invalid.' })
    const result = await verifyAndActivate(txRef, uid)
    return jsonResponse(200, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Authentication required.') return jsonResponse(401, { error: message })
    if (message === 'A verified account email is required.') return jsonResponse(403, { error: message })
    if (message === 'This payment does not belong to your account.') return jsonResponse(404, { error: message })
    return jsonResponse(502, { error: 'Could not verify payment status. Please try again.' })
  }
}