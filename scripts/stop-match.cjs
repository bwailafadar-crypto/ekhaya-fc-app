// Stops a match that was started too early and puts it back to "upcoming",
// keeping the confirmed line-up. Its events are copied to matchBackups/ and
// then removed, the score and clock are cleared, predictions open again.
// Refuses a finished match whose result is already in the table.
//   node scripts/stop-match.cjs <match id>          -> preview only
//   node scripts/stop-match.cjs <match id> --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const [id] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)
if (!id) { console.error('Usage: node scripts/stop-match.cjs <match id> [--apply]'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

async function main() {
  const ref = db.collection('fixtures').doc(id)
  const snap = await ref.get()
  if (!snap.exists) { say(`No match with id ${id}.`); process.exit(1) }
  const f = snap.data()
  const events = (await ref.collection('events').get()).docs
  say(`${apply ? 'STOPPING' : 'PREVIEW'}: ${f.home} v ${f.away} · status ${f.status} · period ${f.period || '-'} · score ${f.homeScore ?? '-'}-${f.awayScore ?? '-'} · ${events.length} event(s) · line-up ${f.lineupConfirmed ? 'confirmed' : 'not confirmed'} (${(f.startingPlayerIds || []).length} starters)`)
  for (const e of events) { const d = e.data(); say(`  event ${d.minute}' ${d.kind} ${d.team || ''} ${d.playerName || d.text || ''}`) }
  if (f.status === 'upcoming') { say('Already upcoming: nothing to stop.'); return }
  if (f.statsApplied) { say('This result is already counted in the table and player stats. Not changed: reset it from the match page instead.'); process.exit(1) }
  if (!apply) { say('Nothing changed. Run with --apply to stop it.'); return }
  const batch = db.batch()
  batch.set(db.collection('matchBackups').doc(`${id}-${Date.now()}`), { fixtureId: id, fixture: f, events: events.map((e) => ({ id: e.id, ...e.data() })), reason: 'started too early', createdAt: FieldValue.serverTimestamp() })
  events.forEach((e) => batch.delete(e.ref))
  const del = FieldValue.delete()
  batch.update(ref, {
    status: 'upcoming', homeScore: del, awayScore: del, minute: del, eventCount: del, liveStartedAt: del, finishedAt: del,
    kickoffAt: del, periodStartedAt: del, period: del, clockElapsedSeconds: del, firstHalfSeconds: del, addedTime: del, matchStats: del,
    predictionsLocked: false, editing: del, statsApplied: false, statsAppliedChanges: del, statsSkipped: del,
    updatedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  say(`Stopped. ${f.home} v ${f.away} is upcoming again (line-up kept, ${events.length} event(s) backed up and removed).`)
}
main().catch((error) => { console.error(error); process.exit(1) })
