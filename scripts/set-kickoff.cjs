// Moves upcoming matches that kick off at 14:30 (Malawi time) to 15:00.
//   node scripts/set-kickoff.cjs          -> preview only
//   node scripts/set-kickoff.cjs --apply  -> save
// Finished matches are not changed. Other kick-off times are only listed.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const FROM = '14:30'
const TO = '15:00'
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

/** Kick-off as Malawi (CAT, UTC+2) "HH:MM", whatever way the date was saved. */
function malawiTime(date) {
  const value = String(date)
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return value.slice(11, 16) // saved as Malawi time already
  const ms = new Date(value).getTime()
  if (Number.isNaN(ms)) return ''
  return new Date(ms + 2 * 3600000).toISOString().slice(11, 16)
}

/** Same date, new Malawi time, written in the same style it was saved in. */
function withTime(date, time) {
  const value = String(date)
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return `${value.slice(0, 11)}${time}${value.slice(16)}`
  const day = new Date(new Date(value).getTime() + 2 * 3600000).toISOString().slice(0, 10)
  return `${day}T${time}:00+02:00`
}

async function main() {
  console.log(apply ? `SAVING: upcoming ${FROM} kick-offs move to ${TO}` : `PREVIEW - upcoming ${FROM} kick-offs move to ${TO} (nothing is changed)`)
  const fixtures = (await db.collection('fixtures').get()).docs
  const batch = db.batch()
  let moved = 0
  for (const doc of fixtures) {
    const f = doc.data()
    if (f.isTest || f.status !== 'upcoming' || !f.date) continue
    const time = malawiTime(f.date)
    if (time === FROM) {
      const next = withTime(f.date, TO)
      console.log(`  ${String(f.date).slice(0, 10)} ${f.home} v ${f.away}: ${FROM} -> ${TO}`)
      batch.update(doc.ref, { date: next, updatedAt: FieldValue.serverTimestamp() })
      moved++
    } else {
      console.log(`  ${String(f.date).slice(0, 10)} ${f.home} v ${f.away}: ${time || 'no time'} (left as it is)`)
    }
  }
  console.log(`\n${moved} match(es) ${apply ? 'moved' : 'would move'} to ${TO}.`)
  if (!apply) { console.log('Run again with --apply to save.'); return }
  if (moved) await batch.commit()
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log('Done. Fans see the new kick-off times straight away.')
}

main().catch((error) => { console.error('Kick-off update failed:', error.message); process.exit(1) })
