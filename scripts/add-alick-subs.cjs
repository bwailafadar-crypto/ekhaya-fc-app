// Records Alick Lungu's unlogged sub appearances (Blue Eagles 23 Oct, MAFCO 1 Nov)
// so the match data reflects that he came on. Idempotent.
// node scripts/add-alick-subs.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const CLUB = /ekhaya/i
const PID = 'alick-lungu', PNAME = 'Alick Lungu'

// match by date + opponent keyword
const targets = [{ date: '2026-10-23', opp: /blue eagles/i }, { date: '2026-11-01', opp: /mafco/i }]

;(async () => {
  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && f.status === 'finished')
  for (const t of targets) {
    const f = fixtures.find((x) => String(x.date || '').slice(0, 10) === t.date && (t.opp.test(x.home || '') || t.opp.test(x.away || '')))
    if (!f) { note(`NOT FOUND: ${t.date} ${t.opp}`); continue }
    const team = CLUB.test(f.home || '') ? f.home : f.away
    const evCol = db.collection('fixtures').doc(f.id).collection('events')
    const existing = (await evCol.where('subbedInPlayerId', '==', PID).get()).docs
    if (existing.length) { note(`${t.date} ${f.home} v ${f.away}: sub already recorded, skipping`) }
    else {
      await evCol.add({ kind: 'substitution', team, subbedInPlayerId: PID, subbedInPlayerName: PNAME, createdAt: FieldValue.serverTimestamp() })
      note(`${t.date} ${f.home} v ${f.away}: added sub-on for ${PNAME}`)
    }
    // Make sure he is in the named squad so it shows in his match log.
    const bench = f.benchPlayerIds ?? []
    if (!bench.includes(PID) && !(f.startingPlayerIds ?? []).includes(PID)) {
      await f.ref.set({ benchPlayerIds: [...bench, PID] }, { merge: true })
      note(`   added ${PNAME} to the bench for this match`)
    }
  }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
