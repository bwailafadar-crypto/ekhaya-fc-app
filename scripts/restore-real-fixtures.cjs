// Puts real fixtures that have NOT been played yet back to "upcoming", exactly
// as in ekhaya-data.json, and undoes any test results recorded on them
// (league table + player stats). Also checks the table against the real data.
//   npm run restore-fixtures            -> preview only (changes nothing)
//   npm run restore-fixtures -- --apply -> apply
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const data = require(path.resolve('ekhaya-data.json'))

const LIVE_FIELDS = ['minute', 'eventCount', 'startingPlayerIds', 'liveStartedAt', 'finishedAt', 'benchPlayerIds', 'lineupConfirmed',
  'kickoffAt', 'periodStartedAt', 'period', 'clockElapsedSeconds', 'firstHalfSeconds', 'addedTime', 'matchStats', 'statsAppliedChanges', 'statsSkipped']
const NUM = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points']

async function main() {
  const now = new Date()
  const notYetPlayed = data.fixtures.filter((f) => f.status === 'upcoming' && new Date(f.date) > now)
  const fixes = []
  const standingDeltas = new Map()
  const playerDeltas = new Map()
  let tableNeedsFullRestore = false

  for (const real of notYetPlayed) {
    const ref = db.collection('fixtures').doc(real.id)
    const snap = await ref.get()
    if (!snap.exists) { fixes.push({ real, ref, reason: 'missing - will be re-created' }); continue }
    const cur = snap.data()
    const events = await ref.collection('events').limit(1).get()
    if (cur.status === 'upcoming' && cur.homeScore == null && cur.awayScore == null && events.empty) continue
    fixes.push({ real, ref, reason: `currently "${cur.status}" ${cur.homeScore ?? '-'}-${cur.awayScore ?? '-'} (test result)` })
    if (cur.statsApplied) {
      const changes = cur.statsAppliedChanges
      if (!changes) { tableNeedsFullRestore = true; continue }
      for (const s of changes.standings ?? []) {
        const acc = standingDeltas.get(s.standingId) ?? { ...Object.fromEntries(NUM.map((k) => [k, 0])), fixtureIds: [] }
        for (const k of ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points']) acc[k] += Number(s[k] ?? 0)
        acc.goalDifference += Number(s.goalsFor ?? 0) - Number(s.goalsAgainst ?? 0)
        acc.fixtureIds.push(real.id)
        standingDeltas.set(s.standingId, acc)
      }
      for (const [playerId, deltas] of Object.entries(changes.players ?? {})) {
        const acc = playerDeltas.get(playerId) ?? {}
        for (const [k, v] of Object.entries(deltas)) acc[k] = (acc[k] ?? 0) + Number(v ?? 0)
        playerDeltas.set(playerId, acc)
      }
    }
  }

  console.log(apply ? 'RESTORING:' : 'PREVIEW - would restore:')
  if (!fixes.length) console.log('  all unplayed real fixtures are already correct')
  fixes.forEach((f) => console.log(`  - ${f.real.home} vs ${f.real.away} (${f.real.date.slice(0, 10)}): ${f.reason}`))

  // Table check against the real data (nothing real has been played since it was loaded).
  const realRows = new Map(data.standings.map((r) => [r.id, r]))
  const tableSnap = await db.collection('standings').get()
  const tableDiffs = []
  for (const doc of tableSnap.docs) {
    const real = realRows.get(doc.id)
    if (!real) continue
    const cur = doc.data()
    const delta = standingDeltas.get(doc.id)
    const after = Object.fromEntries(NUM.map((k) => [k, Number(cur[k] ?? 0) - Number(delta?.[k] ?? 0)]))
    const wrong = NUM.filter((k) => after[k] !== Number(real[k]))
    if (wrong.length) tableDiffs.push({ doc, real, cur, wrong })
  }
  const tableMode = tableDiffs.length || tableNeedsFullRestore ? 'restore' : (standingDeltas.size ? 'subtract' : 'ok')
  console.log(`\nLEAGUE TABLE: ${tableMode === 'ok' ? 'matches the real data' : tableMode === 'subtract' ? `will remove test results from ${standingDeltas.size} team(s)` : 'will be restored to the real table'}`)
  tableDiffs.forEach(({ real, cur }) => console.log(`  - ${real.team}: now P${cur.played} Pts${cur.points} -> real P${real.played} Pts${real.points}`))
  if (playerDeltas.size) console.log(`PLAYER STATS: will remove test-match stats from ${playerDeltas.size} player(s)`)

  if (!apply) { console.log('\nNothing was changed. To apply, run:\n  npm run restore-fixtures -- --apply'); return }

  for (const { real, ref } of fixes) {
    await db.recursiveDelete(ref.collection('events'))
    await db.recursiveDelete(ref.collection('reactions'))
    const update = {
      // Team names are left as they are (they may use the official SULOM names).
      date: real.date, venue: real.venue, status: 'upcoming', homeScore: null, awayScore: null, statsApplied: false,
      updatedAt: FieldValue.serverTimestamp(),
    }
    for (const k of LIVE_FIELDS) update[k] = FieldValue.delete()
    const exists = (await ref.get()).exists
    if (exists) await ref.update(update)
    else await ref.set({ ...real, statsApplied: false, updatedAt: FieldValue.serverTimestamp() })
  }

  if (tableMode !== 'ok') {
    const batch = db.batch()
    for (const doc of tableSnap.docs) {
      const real = realRows.get(doc.id)
      if (!real) continue
      const cur = doc.data()
      const history = Array.isArray(cur.formHistory) ? cur.formHistory.filter((h) => !fixes.some((f) => f.real.id === h.fixtureId)) : null
      const restored = Object.fromEntries(NUM.map((k) => [k, Number(real[k])]))
      batch.update(doc.ref, { ...restored, position: real.position, form: real.form, ...(history ? { formHistory: history } : {}), updatedAt: FieldValue.serverTimestamp() })
    }
    await batch.commit()
  }

  for (const [playerId, deltas] of playerDeltas) {
    const ref = db.collection('players').doc(playerId)
    const snap = await ref.get()
    if (!snap.exists) continue
    const stats = { ...(snap.data().stats ?? {}) }
    for (const [k, v] of Object.entries(deltas)) stats[k] = Math.max(0, Number(stats[k] ?? 0) - v)
    await ref.update({ stats, updatedAt: FieldValue.serverTimestamp() })
  }
  console.log(`\nDone: ${fixes.length} fixture(s) restored${tableMode !== 'ok' ? ', league table restored' : ''}${playerDeltas.size ? `, ${playerDeltas.size} player stat record(s) corrected` : ''}.`)
}

main().catch((error) => { console.error('Restore failed:', error.message); process.exit(1) })
