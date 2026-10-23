// Sets the stadium of one match (its id, e.g. 2026-10-25-ekhaya-fc-v-blue-eagles).
//   node scripts/set-match-venue.cjs <match id> "Mpira Stadium"          -> preview only
//   node scripts/set-match-venue.cjs <match id> "Mpira Stadium" --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const [id, venue] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)
if (!id || !venue || venue.length > 80) { console.error('Usage: node scripts/set-match-venue.cjs <match id> "Stadium name" [--apply]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

async function main() {
  const ref = db.collection('fixtures').doc(id)
  const snap = await ref.get()
  if (!snap.exists) { say(`No match with id ${id}.`); process.exit(1) }
  const f = snap.data()
  say(`${apply ? 'SAVING' : 'PREVIEW'}: ${String(f.date).slice(0, 16)} ${f.home} v ${f.away} [${f.status}] venue ${f.venue || '(none)'} → ${venue}`)
  if (apply) { const batch = db.batch(); batch.update(ref, { venue, updatedAt: FieldValue.serverTimestamp() }); await batch.commit(); say('Saved.') }
}
main().catch((error) => { console.error(error); process.exit(1) })
