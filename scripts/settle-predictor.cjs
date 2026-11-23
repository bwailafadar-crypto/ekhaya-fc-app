// Awards Predictor points for finished LEAGUE matches that have a Man of the
// Match set, and adds them to each fan's running total (predictorScores).
// Idempotent: each match is settled once (fixture.predictorSettled). WRITE=1 saves.
//   node scripts/settle-predictor.cjs
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const POINTS = { score: 5, scorer: 3, motm: 3 }
const isLeague = (c) => !/airtel|castel|\bcup\b|top\s?8/i.test(String(c || ''))

;(async () => {
  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => f.status === 'finished' && !f.isTest && (f.squad || 'men') === 'men' && isLeague(f.competition) && f.predictorSettled !== true)
  note(`Finished league matches awaiting settlement: ${fixtures.length}`)

  for (const f of fixtures) {
    if (!f.manOfTheMatchId) { note(`  SKIP ${f.home} v ${f.away}: set the Man of the Match first, then re-run.`); continue }
    const scorers = new Set((await db.collection('fixtures').doc(f.id).collection('events').get()).docs
      .filter((d) => d.data().kind === 'goal').map((d) => String(d.data().playerId || '')))
    const picks = (await db.collection('fixtures').doc(f.id).collection('picks').get()).docs.map((d) => ({ uid: d.id, ...d.data() }))
    const award = new Map() // uid -> { points, name }
    for (const p of picks) {
      let ok = false
      if (p.type === 'score') ok = p.home === f.homeScore && p.away === f.awayScore
      else if (p.type === 'scorer') ok = scorers.has(p.playerId)
      else if (p.type === 'motm') ok = p.playerId === f.manOfTheMatchId
      if (ok) award.set(p.uid, { points: POINTS[p.type] || 0, name: p.name || 'Fan' })
    }
    note(`  ${f.home} ${f.homeScore}-${f.awayScore} ${f.away}: ${picks.length} picks, ${award.size} earn points`)
    if (!WRITE) continue
    const batch = db.batch()
    for (const [uid, a] of award) batch.set(db.doc(`predictorScores/${uid}`), { points: FieldValue.increment(a.points), name: a.name, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    batch.set(db.doc(`fixtures/${f.id}`), { predictorSettled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await batch.commit()
    note(`  -> awarded points to ${award.size} fans, match marked settled.`)
  }
  note(WRITE ? 'Done.' : 'DRY RUN (set WRITE=1 to save points).')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
