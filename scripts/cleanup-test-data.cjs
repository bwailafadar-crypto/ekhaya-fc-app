// Removes TEST/DEMO data only. Real fixtures, players, teams and standings
// are never touched.
//   npm run cleanup-test-data            -> preview only (deletes nothing)
//   npm run cleanup-test-data -- --apply -> actually delete
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

const real = require(path.resolve('ekhaya-data.json'))
const realFixtureIds = new Set(real.fixtures.map((f) => f.id))
const realPlayerIds = new Set(real.players.map((p) => p.id))
const OWNER_TEST_EMAIL = 'brian@ekhayafc.com'

async function main() {
  const targets = []

  const fixtures = (await db.collection('fixtures').get()).docs
  for (const doc of fixtures) {
    const f = doc.data()
    if (f.isTest) targets.push({ ref: doc.ref, label: `Test match: ${f.home} vs ${f.away} [${f.status}]` })
    else if (!realFixtureIds.has(doc.id)) {
      if (f.status === 'live' || f.statsApplied) {
        console.log(`SKIPPED (has live/applied stats, reset it in the app first): ${doc.id} ${f.home} vs ${f.away}`)
        continue
      }
      targets.push({ ref: doc.ref, label: `Duplicate fixture: ${f.home} vs ${f.away} ${String(f.date ?? '').slice(0, 10)} [${f.status}]` })
    }
  }

  const memberships = (await db.collection('memberships').get()).docs
  for (const doc of memberships) {
    const m = doc.data()
    if (m.email === OWNER_TEST_EMAIL && m.status === 'pending') targets.push({ ref: doc.ref, label: `Test membership request: ${m.fullName} <${m.email}> ${m.tierId}` })
  }

  console.log(apply ? 'DELETING:' : 'PREVIEW - would delete:')
  if (!targets.length) console.log('  nothing - no test data found')
  targets.forEach((t) => console.log(`  - ${t.label}`))

  const players = (await db.collection('players').get()).docs
  const extraPlayers = players.filter((d) => !realPlayerIds.has(d.id))
  if (extraPlayers.length) {
    console.log('\nPlayers not in your original squad list (NOT deleted - remove in Admin > Squad if they are not real):')
    extraPlayers.forEach((d) => console.log(`  - ${d.data().name} (#${d.data().number ?? '-'}, ${d.data().position ?? 'no position'})`))
  }

  if (!apply) {
    console.log('\nNothing was deleted. To delete the items above, run:\n  npm run cleanup-test-data -- --apply')
    return
  }
  for (const t of targets) await db.recursiveDelete(t.ref)
  console.log(`\nDone: removed ${targets.length} test item(s) (including their match events and reactions).`)
}

main().catch((error) => { console.error('Cleanup failed:', error.message); process.exit(1) })
