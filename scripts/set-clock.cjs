// Sets the live match clock to a minute (e.g. 64) and keeps it running.
//   node scripts/set-clock.cjs <match id> <minute> [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const [id, minuteText] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
const minute = Number(minuteText)
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)
if (!id || !Number.isInteger(minute) || minute < 1 || minute > 120) { console.error('Usage: node scripts/set-clock.cjs <match id> <minute 1-120> [--apply]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

async function main() {
  const ref = db.collection('fixtures').doc(id)
  const snap = await ref.get()
  if (!snap.exists) { say(`No match ${id}`); process.exit(1) }
  const f = snap.data()
  say(`${f.home} v ${f.away}: status ${f.status}, period ${f.period || '-'}, score ${f.homeScore ?? 0}-${f.awayScore ?? 0}, clock ${f.clockElapsedSeconds ?? '-'}s, first half ${f.firstHalfSeconds ?? '-'}s`)
  if (f.status !== 'live') { say('The match is not live: clock not changed.'); process.exit(1) }
  const secondHalf = minute > 45
  const firstHalfSeconds = Number(f.firstHalfSeconds ?? 45 * 60)
  // Shown minute = elapsed in the half rounded up, so one second past (minute-1):00.
  const clockElapsedSeconds = secondHalf ? firstHalfSeconds + (minute - 46) * 60 + 1 : (minute - 1) * 60 + 1
  const update = { period: secondHalf ? 'second-half' : 'first-half', clockElapsedSeconds, periodStartedAt: FieldValue.serverTimestamp(), minute, updatedAt: FieldValue.serverTimestamp(), ...(secondHalf && f.firstHalfSeconds == null ? { firstHalfSeconds } : {}) }
  say(`${apply ? 'SETTING' : 'PREVIEW'}: clock → ${minute}' (${update.period}), running`)
  if (apply) { const batch = db.batch(); batch.update(ref, update); await batch.commit(); say('Saved.') }
}
main().catch((error) => { console.error(error); process.exit(1) })
