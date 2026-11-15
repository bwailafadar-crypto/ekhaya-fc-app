// Set a shop product's price by name match. Safe: refuses unless exactly one
// product matches. PRODUCT_NAME is a case-insensitive substring; PRICE in MWK.
//   PRODUCT_NAME=Tracksuit PRICE=30000 node scripts/set-product-price.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const name = (process.env.PRODUCT_NAME || '').trim().toLowerCase()
const price = Number(process.env.PRICE)
if (!name || !Number.isFinite(price) || price <= 0) { console.error('✖ Need PRODUCT_NAME and a positive PRICE.'); process.exit(1) }

;(async () => {
  const snap = await db.collection('shopProducts').get()
  const matches = snap.docs.filter((d) => String(d.data().name || '').toLowerCase().includes(name))
  if (matches.length === 0) { console.error(`✖ No product name contains "${process.env.PRODUCT_NAME}".`); process.exit(1) }
  if (matches.length > 1) { console.error(`✖ ${matches.length} products match "${process.env.PRODUCT_NAME}": ${matches.map((d) => d.data().name).join(', ')}. Be more specific.`); process.exit(1) }
  const d = matches[0]
  const before = Number(d.data().price)
  await d.ref.set({ price, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  note(`${d.data().name}: price ${before} -> ${price} MWK. Live for fans immediately.`)
})().catch((error) => { console.error('✖', error.message); process.exit(1) })
