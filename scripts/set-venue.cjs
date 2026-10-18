// Sets a club's home ground and puts it on that club's home matches.
//   node scripts/set-venue.cjs "Red Lions" "Zomba Stadium"          -> preview only
//   node scripts/set-venue.cjs "Red Lions" "Zomba Stadium" --apply  -> save
// Matches that already have a different venue are listed but not changed,
// unless you add --replace.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const [team, venue] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
const replace = process.argv.includes('--replace')
if (!team || !venue) { console.error('Usage: node scripts/set-venue.cjs "Team name" "Stadium name" [--apply] [--replace]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

async function main() {
  console.log(apply ? `SAVING: ${team} home ground = ${venue}` : `PREVIEW - ${team} home ground = ${venue} (nothing is changed)`)
  const batch = db.batch()
  let changes = 0
  const teams = (await db.collection('teams').get()).docs.filter((d) => norm(d.data().name) === norm(team))
  if (!teams.length) console.log(`  ! No team called "${team}" in the app (matches are still updated).`)
  for (const d of teams) {
    if (d.data().homeGround === venue) { console.log(`  Team: already ${venue}`); continue }
    console.log(`  Team: home ground ${d.data().homeGround || '(empty)'} -> ${venue}`)
    batch.update(d.ref, { homeGround: venue, updatedAt: FieldValue.serverTimestamp() })
    changes++
  }
  for (const d of (await db.collection('fixtures').get()).docs) {
    const f = d.data()
    if (f.isTest || norm(f.home) !== norm(team)) continue
    const label = `${String(f.date).slice(0, 10)} ${f.home} v ${f.away} [${f.status}]`
    if (f.venue === venue) { console.log(`  ${label}: already ${venue}`); continue }
    if (f.venue && !replace) { console.log(`  ${label}: has "${f.venue}" (left; add --replace to change)`); continue }
    console.log(`  ${label}: ${f.venue || '(no venue)'} -> ${venue}`)
    batch.update(d.ref, { venue, updatedAt: FieldValue.serverTimestamp() })
    changes++
  }
  console.log(`\n${changes} change(s).`)
  if (!apply) { console.log('Run again with --apply to save.'); return }
  if (changes) await batch.commit()
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log('Done. Fans see the stadium straight away.')
}

main().catch((error) => { console.error('Venue update failed:', error.message); process.exit(1) })
