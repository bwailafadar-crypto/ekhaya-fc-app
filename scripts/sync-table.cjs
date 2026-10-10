// Puts the official league table from ekhaya-data.json (standings) into the
// live app. Each team's current position is kept as previousPosition, so the
// table shows ▲ / ▼ for how teams moved. Team names and logos are not changed.
//   node scripts/sync-table.cjs          -> preview only
//   node scripts/sync-table.cjs --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const official = require(path.resolve('ekhaya-data.json')).standings
const NUM = ['position', 'played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points']

async function main() {
  const live = new Map((await db.collection('standings').get()).docs.map((doc) => [doc.id, doc]))
  console.log(apply ? 'SAVING league table:' : 'PREVIEW - league table (nothing is changed):')
  const batch = db.batch()
  let changed = 0
  for (const row of official) {
    const doc = live.get(row.id)
    const cur = doc ? doc.data() : {}
    const diff = NUM.filter((k) => Number(cur[k] ?? -1) !== Number(row[k])).concat(JSON.stringify(cur.form ?? []) !== JSON.stringify(row.form) ? ['form'] : [])
    const move = cur.position && cur.position !== row.position ? (cur.position > row.position ? ` ▲ from ${cur.position}` : ` ▼ from ${cur.position}`) : ''
    console.log(`  ${String(row.position).padStart(2)}. ${row.team.padEnd(26)} P${row.played} W${row.won} D${row.drawn} L${row.lost} ${row.goalsFor}:${row.goalsAgainst} ${row.points} pts${move}${diff.length ? '' : '  (no change)'}`)
    if (!diff.length && doc) continue
    changed++
    const update = Object.fromEntries(NUM.map((k) => [k, Number(row[k])]))
    batch.set(db.collection('standings').doc(row.id), {
      ...(doc ? {} : { id: row.id, team: row.team }),
      ...update,
      form: row.form,
      previousPosition: Number(cur.position ?? row.position),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  if (!apply) { console.log(`\n${changed} team(s) would change. Run again with mode "apply" to save.`); return }
  if (changed) await batch.commit()
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log(`\nDone: ${changed} team(s) updated. Fans see the new table straight away.`)
}

main().catch((error) => { console.error('Table update failed:', error.message); process.exit(1) })
