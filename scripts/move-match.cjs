// Moves one match to a new date (and optionally a new Malawi kick-off time).
//   node scripts/move-match.cjs <match-id> 2026-10-23           -> preview (keeps the kick-off time)
//   node scripts/move-match.cjs <match-id> 2026-10-23 15:00 --apply
// Use "next" as the match id for Ekhaya's next upcoming match.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
const [matchId, day, time] = args
if (!matchId || !/^\d{4}-\d{2}-\d{2}$/.test(day || '') || (time && !/^\d{2}:\d{2}$/.test(time))) {
  console.error('Usage: node scripts/move-match.cjs <match-id|next> YYYY-MM-DD [HH:MM] [--apply]'); process.exit(1)
}
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

const hasZone = (v) => /[zZ]|[+-]\d\d:?\d\d$/.test(String(v))
const malawiTime = (v) => (hasZone(v) ? new Date(new Date(v).getTime() + 2 * 3600000).toISOString().slice(11, 16) : String(v).slice(11, 16))
const weekday = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })

async function main() {
  let ref
  if (matchId === 'next') {
    const docs = (await db.collection('fixtures').where('status', '==', 'upcoming').get()).docs
      .filter((d) => !d.data().isTest && /ekhaya/i.test(`${d.data().home} ${d.data().away}`))
      .sort((a, b) => new Date(a.data().date) - new Date(b.data().date))
    if (!docs.length) throw new Error('No upcoming Ekhaya match found.')
    ref = docs[0].ref
  } else ref = db.collection('fixtures').doc(matchId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`Match ${matchId} not found.`)
  const f = snap.data()
  if (f.status !== 'upcoming') throw new Error(`${f.home} v ${f.away} is ${f.status}; only upcoming matches can be moved.`)
  const kickoff = time || malawiTime(f.date) || '15:00'
  const next = `${day}T${kickoff}:00+02:00`
  console.log(`${apply ? 'SAVING' : 'PREVIEW (nothing is changed)'}: ${f.home} v ${f.away}`)
  console.log(`  from ${String(f.date).slice(0, 10)} ${malawiTime(f.date)}  ->  ${weekday(day)} ${day} ${kickoff} (Malawi time)`)
  if (!apply) { console.log('Run again with --apply to save.'); return }
  await ref.update({ date: next, predictionsLocked: false, updatedAt: FieldValue.serverTimestamp() })
  await require('./publish-snapshot.cjs').publishSnapshot()
  console.log('Done. Fans see the new date straight away.')
}

main().catch((error) => { console.error('Move failed:', error.message); process.exit(1) })
