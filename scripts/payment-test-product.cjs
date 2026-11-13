// Adds (or removes) a temporary MK 100 "Payment test" product used to confirm
// live PayChangu payments end to end. It is staffOnly, so ONLY admins/superadmin
// ever see it — fans never do, whatever the shop flags are.
//   ACTION=add node scripts/payment-test-product.cjs
//   ACTION=remove node scripts/payment-test-product.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) }); const db = getFirestore()
const out = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const ID = 'payment-test'

;(async () => {
  const action = String(process.env.ACTION || 'add').toLowerCase()
  const ref = db.collection('shopProducts').doc(ID)
  if (action === 'remove') {
    const was = (await ref.get()).exists
    await ref.delete()
    out(was ? 'Removed the test product.' : 'Test product was not there.')
    return
  }
  await ref.set({
    name: 'Payment test — please ignore',
    category: 'accessories',
    price: 100,
    active: true,
    staffOnly: true,
    order: 999,
    description: 'Temporary MK 100 item to test live payments. Remove after testing.',
    images: [],
  }, { merge: true })
  out('Added the MK 100 staff-only test product. Open the app (superadmin) → Shop → buy it.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
