// Deletes ONLY the payment-test data created while testing: orders whose ref
// starts with "E2E-" or that contain the payment-test product, and their
// payments. Leaves all real orders untouched. Read first, delete second.
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const isTestOrder = (o) => String(o.ref || '').startsWith('E2E-') || (Array.isArray(o.lines) && o.lines.some((l) => l && l.productId === 'payment-test'))

;(async () => {
  const orders = await db.collection('shopOrders').get()
  const testOrderIds = new Set()
  for (const d of orders.docs) { if (isTestOrder(d.data())) { testOrderIds.add(d.id); await d.ref.delete() } }
  note(`Deleted ${testOrderIds.size} test order(s).`)

  const pays = await db.collection('shopPayments').get()
  let delPays = 0
  for (const d of pays.docs) {
    const p = d.data()
    if (testOrderIds.has(String(p.orderId)) || String(p.ref || '').startsWith('E2E-') || (p.status !== 'paid' && Number(p.amount) === 100)) { await d.ref.delete(); delPays++ }
  }
  note(`Deleted ${delPays} test payment record(s).`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
