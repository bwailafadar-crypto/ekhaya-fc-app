// Adds or removes the MK 100 "payment test" item that only admins can see in the shop.
//   ACTION=add|remove node scripts/test-item.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const ref = getFirestore().collection('shopProducts').doc('payment-test-100')
async function main() {
  if (process.env.ACTION === 'remove') { await ref.delete(); console.log('::notice::Test item removed.'); return }
  await ref.set({ name: 'Payment test (admins only)', category: 'accessories', price: 100, sizes: [], active: true, staffOnly: true, badge: 'Limited', order: 0, description: 'MK 100 item to try PIN payments. Fans cannot see it.', createdAt: FieldValue.serverTimestamp() })
  console.log('::notice::Test item added: Payment test (admins only), MK 100.')
}
main().catch((e) => { console.error(e); process.exit(1) })
