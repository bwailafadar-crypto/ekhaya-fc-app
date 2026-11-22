// Kicks off the Ekhaya Women fixture from the backend (mirrors the app's
// startMatch): sets status live, first half, clock from now. WRITE=1 to apply.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const FIXTURE = 'w-2026-11-21-ekhaya-nsuwadzi'
const EMPTY = { shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, offsides: 0 }

;(async () => {
  const ref = db.doc(`fixtures/${FIXTURE}`)
  const snap = await ref.get()
  if (!snap.exists) { note(`Fixture ${FIXTURE} not found`); return }
  const f = snap.data()
  note(`${f.home} v ${f.away} | status=${f.status} | XI=${(f.startingPlayerIds || []).length} | subs=${(f.benchPlayerIds || []).length}`)
  if (f.status === 'live') { note('Already live — nothing to do.'); return }
  if (f.status !== 'upcoming') { note(`Only an upcoming fixture can be kicked off (is ${f.status}).`); return }
  if ((f.startingPlayerIds || []).length !== 11) { note('No confirmed XI (need 11). Aborting.'); return }
  if (!WRITE) { note('DRY RUN (set WRITE=1 to kick off).'); return }
  const now = FieldValue.serverTimestamp()
  await ref.set({
    status: 'live', homeScore: 0, awayScore: 0, period: 'first-half',
    predictionsLocked: true,
    kickoffAt: now, periodStartedAt: now, clockElapsedSeconds: 0, firstHalfSeconds: 0, addedTime: 0,
    matchStats: f.matchStats ?? { home: { ...EMPTY }, away: { ...EMPTY } },
    eventCount: 0, lineupConfirmed: true,
    liveStartedAt: now, updatedAt: now,
  }, { merge: true })
  note('Kicked off. The women\'s match is now LIVE.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
