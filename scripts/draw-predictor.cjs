// Predictor prize draw: over the finished LEAGUE matches of the last N days,
// judge every fan pick, give one draw entry per correct pick, and pick a random
// winner. READ-ONLY (never awards anything) — the admin hands over the prize.
//   node scripts/draw-predictor.cjs            (default: last 14 days)
//   DAYS=14 node scripts/draw-predictor.cjs
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const DAYS = Number(process.env.DAYS || 14)
const isLeague = (c) => !/airtel|castel|\bcup\b|top\s?8/i.test(String(c || ''))
const isEkhaya = (n) => /^ekhaya/i.test(String(n || '')) && !/women/i.test(String(n || ''))

;(async () => {
  const since = Date.now() - DAYS * 24 * 3600 * 1000
  const fixtures = (await db.collection('fixtures').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => (f.status === 'finished') && !f.isTest && (f.squad || 'men') === 'men' && isLeague(f.competition))
    .filter((f) => { const t = f.kickoffAt?.toMillis?.() ?? Date.parse(f.date); return !Number.isNaN(t) && t >= since })
  note(`Finished league matches in the last ${DAYS} days: ${fixtures.length}`)
  if (!fixtures.length) { note('No matches to settle. Nothing to draw.'); return }

  const entries = [] // one per correct pick: { uid, name, match, type }
  let totalPicks = 0
  for (const f of fixtures) {
    const scorers = new Set((await db.collection('fixtures').doc(f.id).collection('events').get()).docs
      .filter((d) => d.data().kind === 'goal').map((d) => String(d.data().playerId || '')))
    const picks = (await db.collection('fixtures').doc(f.id).collection('picks').get()).docs
    totalPicks += picks.length
    let correct = 0
    for (const p of picks.map((d) => ({ uid: d.id, ...d.data() }))) {
      let ok = false
      if (p.type === 'score') ok = p.home === f.homeScore && p.away === f.awayScore
      else if (p.type === 'scorer') ok = scorers.has(p.playerId)
      else if (p.type === 'motm') ok = Boolean(f.manOfTheMatchId) && p.playerId === f.manOfTheMatchId
      if (ok) { entries.push({ uid: p.uid, name: p.name || 'Fan', match: `${f.home} v ${f.away}`, type: p.type }); correct++ }
    }
    const label = `${f.home} ${f.homeScore}-${f.awayScore} ${f.away}`
    note(`  ${label}: ${picks.length} picks, ${correct} correct${f.manOfTheMatchId ? '' : ' (MOTM not set)'}`)
  }

  const fans = new Set(entries.map((e) => e.uid))
  note(`Total picks: ${totalPicks} | correct entries: ${entries.length} | eligible fans: ${fans.size}`)
  if (!entries.length) { note('No correct predictions this cycle — no winner drawn.'); return }

  const win = entries[Math.floor(Math.random() * entries.length)]
  note(`WINNER: ${win.name} (uid ${win.uid}) — correct ${win.type} pick on ${win.match}`)
  note(`(${entries.filter((e) => e.uid === win.uid).length} of this fan's entries were in the draw.)`)
  note('Give the prize to this fan. Re-run to draw again if needed.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
