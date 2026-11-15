// Set shop settings (shopSettings/main) without a deploy, e.g. go live or add a
// payment number. Values come from SHOP_JSON, e.g. {"payMode":"live"}.
//   SHOP_JSON='{"payMode":"live"}' node scripts/set-shop.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

let updates
try { updates = JSON.parse(process.env.SHOP_JSON || '') } catch { updates = null }
if (!updates || typeof updates !== 'object' || !Object.keys(updates).length) {
  console.error('✖ Provide SHOP_JSON, e.g. {"payMode":"live"}'); process.exit(1)
}

;(async () => {
  const ref = db.doc('shopSettings/main')
  const before = (await ref.get()).data() ?? {}
  await ref.set({ ...updates, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  const after = (await ref.get()).data() ?? {}
  for (const key of Object.keys(updates)) note(`${key}: ${before[key] ?? '(unset)'} -> ${after[key]}`)
  note('Shop settings saved. Fans see the change immediately (no deploy).')
})().catch((error) => { console.error('✖', error.message); process.exit(1) })
