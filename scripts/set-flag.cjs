// Switches an app feature on or off for everyone (appConfig/flags), the same
// as the switches in Admin → App health.
//   FLAG=ekhayaTv VALUE=true node scripts/set-flag.cjs
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const FLAG = String(process.env.FLAG || '').trim(); const VALUE = process.env.VALUE === 'true'
const known = [...fs.readFileSync(path.resolve('src/data/flags.ts'), 'utf8').matchAll(/^\s{2}(\w+): \{ label:/gm)].map((m) => m[1])
async function main() {
  if (!known.includes(FLAG)) throw new Error(`Unknown switch "${FLAG}". Known: ${known.join(', ')}`)
  const ref = db.collection('appConfig').doc('flags')
  const before = (await ref.get()).data()?.flags?.[FLAG]
  await ref.set({ flags: { [FLAG]: VALUE }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`::notice::${FLAG}: ${before === undefined ? '(default)' : before} → ${VALUE}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
