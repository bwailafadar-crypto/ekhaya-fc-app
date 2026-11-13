// Safety net: finds shop payments that aren't marked paid yet, asks PayChangu
// whether the money actually came through, and if so marks the payment AND its
// order as paid — so every real transaction reflects in the app, even if the
// live confirmation and the webhook both missed it.
//   node scripts/reconcile-payments.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const API = 'https://api.paychangu.com'
const h = { authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`, accept: 'application/json' }

;(async () => {
  const snap = await db.collection('shopPayments').get()
  let checked = 0; let paid = 0
  for (const d of snap.docs) {
    const p = d.data()
    if (p.status === 'paid' || !p.chargeId) continue
    checked++
    const r = await fetch(`${API}/mobile-money/payments/${encodeURIComponent(String(p.chargeId))}/verify`, { headers: h })
    const j = await r.json().catch(() => ({}))
    const status = String(j?.status ?? '').toLowerCase()
    const details = j?.data ?? {}
    const amount = Number(details.amount ?? details.charge ?? details.total_amount)
    if (!['success', 'successful', 'paid', 'completed'].includes(status)) { note(`${d.id.slice(0, 12)} still ${status || 'unknown'}`); continue }
    const owed = Number(p.amount)
    // PayChangu adds its fee on top, so the verified amount is owed + fee.
    if (!(amount >= owed && amount <= owed * 1.1 + 5)) { note(`${d.id.slice(0, 12)} amount off (${amount} vs owed ${owed}) -> review`); await d.ref.update({ status: 'review', updatedAt: FieldValue.serverTimestamp() }); continue }
    const tx = String(details.trans_id ?? details.ref_id ?? details.reference ?? p.chargeId).slice(0, 40)
    await d.ref.update({ status: 'paid', updatedAt: FieldValue.serverTimestamp() })
    if (p.orderId) {
      const orderRef = db.collection('shopOrders').doc(String(p.orderId))
      const o = await orderRef.get()
      if (o.exists) await orderRef.update({ status: 'paid', payment: { ...(o.data()?.payment ?? {}), method: p.method, provider: 'paychangu', txRef: p.chargeId, status: 'paid', txId: tx }, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    }
    paid++
    note(`${d.id.slice(0, 12)} -> PAID (MK ${amount})`)
  }
  note(`Reconcile done: ${checked} checked, ${paid} marked paid.`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
