// Saves shop settings (payment numbers, account details, prices...) to shopSettings/main.
//   SETTINGS='{"airtelNumber":"0997776776"}' node scripts/set-shop-settings.cjs [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const ALLOWED = ['whatsapp', 'airtelNumber', 'mpambaNumber', 'payName', 'fdhAccount', 'fdhAccountName', 'fdhBranch', 'printPrice', 'deliveryPrice', 'freeDeliveryFrom', 'pickupPlace', 'bannerTitle', 'bannerText', 'paymentNote', 'payApi', 'payMode']
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const say = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
async function main() {
  const input = JSON.parse(process.env.SETTINGS || '{}')
  const bad = Object.keys(input).filter((k) => !ALLOWED.includes(k))
  if (bad.length) throw new Error(`Unknown setting(s): ${bad.join(', ')}`)
  const ref = db.collection('shopSettings').doc('main')
  const before = (await ref.get()).data() ?? {}
  say(`${apply ? 'SAVING' : 'PREVIEW'}: ${Object.entries(input).map(([k, v]) => `${k}: ${before[k] ?? '(empty)'} → ${v}`).join(' · ')}`)
  say(`Payment note now: ${before.paymentNote ?? '(default)'}`)
  if (apply) { await ref.set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); say('Saved.') }
}
main().catch((e) => { console.error(e); process.exit(1) })
