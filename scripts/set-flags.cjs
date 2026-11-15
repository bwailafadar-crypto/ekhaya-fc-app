// Set one or more feature flags in appConfig/flags without a deploy.
// Flags to change come from FLAGS_JSON, e.g. {"clubShop":true}. A merge write
// only touches the named flags and leaves the rest (and the notice) alone.
//   FLAGS_JSON='{"clubShop":true}' node scripts/set-flags.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

let updates
try { updates = JSON.parse(process.env.FLAGS_JSON || '') } catch { updates = null }
if (!updates || typeof updates !== 'object' || !Object.keys(updates).length) {
  console.error('✖ Provide FLAGS_JSON, e.g. {"clubShop":true}'); process.exit(1)
}

;(async () => {
  const ref = db.doc('appConfig/flags')
  const before = (await ref.get()).data()?.flags ?? {}
  await ref.set({ flags: updates, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  const after = (await ref.get()).data()?.flags ?? {}
  for (const key of Object.keys(updates)) note(`Flag ${key}: ${before[key] === undefined ? 'default' : before[key]} -> ${after[key]}`)
  note('Flags saved. Fans see the change immediately (no deploy needed).')
})().catch((error) => { console.error('✖', error.message); process.exit(1) })
