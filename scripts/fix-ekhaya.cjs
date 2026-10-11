// Small club fixes in the live database (run once):
//  • Ekhaya FC's table arrow points UP (▲)
//  • Ekhaya FC's home ground is Chiwembe Stadium
//  • Ekhaya league home matches with no venue get Chiwembe Stadium
//   node scripts/fix-ekhaya.cjs          -> preview only
//   node scripts/fix-ekhaya.cjs --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
require('node:dns').setDefaultResultOrder('ipv4first')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const HOME = 'Chiwembe Stadium'

async function main() {
  console.log(apply ? 'SAVING:' : 'PREVIEW (nothing is changed; run again with --apply to save):')
  const batch = db.batch()
  let changes = 0
  const row = await db.collection('standings').doc('ekhaya-fc').get()
  if (row.exists) {
    const position = Number(row.get('position'))
    console.log(`  • Table: Ekhaya FC ${position}th → arrow ▲ (shown as up from ${position + 1})`)
    batch.update(row.ref, { previousPosition: position + 1, updatedAt: FieldValue.serverTimestamp() })
    changes++
  }
  const team = await db.collection('teams').doc('ekhaya-fc').get()
  if (team.exists && team.get('homeGround') !== HOME) {
    console.log(`  • Team: home ground "${team.get('homeGround') ?? 'not set'}" → "${HOME}"`)
    batch.update(team.ref, { homeGround: HOME, updatedAt: FieldValue.serverTimestamp() })
    changes++
  } else console.log(`  ✔ Team home ground is already ${HOME}`)
  const fixtures = await db.collection('fixtures').get()
  for (const doc of fixtures.docs) {
    const f = doc.data()
    const league = !/top 8|castel|cup|friendly|practice/i.test(String(f.competition ?? ''))
    if (!f.isTest && league && /^ekhaya/i.test(String(f.home ?? '')) && !f.venue) {
      console.log(`  • Venue: ${f.home} v ${f.away} (${String(f.date).slice(0, 10)}) → ${HOME}`)
      batch.update(doc.ref, { venue: HOME, updatedAt: FieldValue.serverTimestamp() })
      changes++
    }
  }
  if (!apply) { console.log(`\n${changes} change(s) would be saved.`); return }
  if (changes) await batch.commit()
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log(`\nDone: ${changes} change(s) saved. Fans see them straight away.`)
}

main().then(() => process.exit(0)).catch((error) => { console.error('✖', error.message); process.exit(1) })
