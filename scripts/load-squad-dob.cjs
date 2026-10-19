// Loads dates of birth from a squad sheet file (data/squad-dob-*.json) and adds
// players from the sheet who are not in the squad yet.
//   node scripts/load-squad-dob.cjs data/squad-dob-2026-10-19.json          -> preview only
//   node scripts/load-squad-dob.cjs data/squad-dob-2026-10-19.json --apply  -> save
// Shirt numbers, positions, photos and stats are never touched.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/load-squad-dob.cjs data/squad-dob-<date>.json [--apply]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const sheet = JSON.parse(fs.readFileSync(file, 'utf8'))
const norm = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
const EMPTY_STATS = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }
const age = (dob) => { const b = new Date(`${dob}T00:00:00`); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a -= 1; return a }

async function main() {
  console.log(apply ? `SAVING: ${sheet.source}` : `PREVIEW - ${sheet.source} (nothing is changed)`)
  const live = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
  const batch = db.batch()
  let changes = 0
  const sheetNames = new Set(sheet.players.map((row) => norm(row.name)))
  const taken = new Set(live.map((p) => p.id))
  for (const row of sheet.players) {
    // Match by NAME first. A record id is only trusted when that record has not
    // been renamed to another player on the sheet (ids keep their first name).
    const byId = live.find((p) => p.id === row.playerId)
    const match = live.find((p) => norm(p.name) === norm(row.name))
      || (byId && !sheetNames.has(norm(byId.name)) ? byId : undefined)
    if (!match) {
      let newId = row.playerId
      for (let n = 2; taken.has(newId); n += 1) newId = `${row.playerId}-${n}`
      taken.add(newId)
      console.log(`  + add ${row.name}${row.dob ? `, born ${row.dob} (${age(row.dob)})` : ''}`)
      batch.set(db.collection('players').doc(newId), {
        name: row.name, number: null, team: 'senior', position: null, dob: row.dob ?? null, nationality: 'Malawian',
        preferredFoot: null, heightCm: null, photoDataUrl: null, stats: { ...EMPTY_STATS },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
      changes++
      continue
    }
    if (!row.dob) continue
    if (match.dob === row.dob) { console.log(`  = ${match.name}: ${row.dob} (already set)`); continue }
    console.log(`  ~ ${match.name}: ${match.dob || '(no date)'} -> ${row.dob} (${age(row.dob)} years)`)
    batch.update(match.ref, { dob: row.dob, updatedAt: FieldValue.serverTimestamp() })
    changes++
  }
  for (const note of sheet.notes ?? []) console.log(`\nNote: ${note}`)
  console.log(`\n${changes} change(s).`)
  if (!apply) { console.log('Run again with --apply to save.'); return }
  if (changes) await batch.commit()
  console.log('Done. Ages show on the squad and player pages straight away.')
}

main().catch((error) => { console.error('Squad sheet failed:', error.message); process.exit(1) })
