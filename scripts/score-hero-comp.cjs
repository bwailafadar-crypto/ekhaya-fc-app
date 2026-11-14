// Matchday Hero competition scorer (free; runs on GitHub Actions).
// For each finished men's match not yet scored, award fans who picked a player
// that did something: +5 per goal, +3 per assist, +4 if he was man of the match.
// Points accumulate over a round of 5 matches; the fan on top wins a jersey,
// then the round rolls over automatically.
//   node scripts/score-hero-comp.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const GOAL = 5, ASSIST = 3, MOM = 4
const MATCHES_PER_ROUND = 5
const PRIZE = 'Ekhaya FC jersey'
const CLUB = /ekhaya/i
const isMen = (f) => (f.squad ?? 'men') === 'men'
const isClub = (f) => CLUB.test(f.home || '') || CLUB.test(f.away || '')
const hasResult = (f) => f.homeScore != null && f.awayScore != null

function freshRound(roundNumber) {
  return { roundNumber, status: 'open', matchesInRound: MATCHES_PER_ROUND, countedFixtureIds: [], standings: {}, prize: PRIZE }
}

async function loadCurrent() {
  const ref = db.doc('heroComp/current')
  const snap = await ref.get()
  if (snap.exists) return { ref, data: snap.data() }
  const data = freshRound(1)
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() })
  return { ref, data }
}

// Points each player earned this match, from goals (scorer + assist) and MOM.
async function playerPoints(fixtureId, fixture) {
  const points = {}
  const add = (pid, n) => { if (pid) points[pid] = (points[pid] || 0) + n }
  const events = await db.collection(`fixtures/${fixtureId}/events`).where('kind', '==', 'goal').get()
  for (const e of events.docs) {
    const g = e.data()
    // Only Ekhaya players score points (own goals / opponents never count).
    add(g.playerId, GOAL)
    add(g.assistPlayerId, ASSIST)
  }
  if (fixture.motmWinnerId) add(fixture.motmWinnerId, MOM)
  return points // { playerId: pointsForPickingHim }
}

// Add this match's points to the round standings (only fans who picked a
// player who scored points are read — keeps reads small).
async function scoreInto(standings, fixtureId, points) {
  for (const [playerId, value] of Object.entries(points)) {
    if (value <= 0) continue
    const picks = await db.collection(`fixtures/${fixtureId}/heroPicks`).where('playerId', '==', playerId).get()
    for (const p of picks.docs) {
      const uid = p.id
      const name = String(p.data().name || 'Fan')
      const prev = standings[uid] || { name, points: 0 }
      standings[uid] = { name, points: prev.points + value }
    }
  }
}

function decideWinner(standings) {
  let best = null
  for (const [uid, s] of Object.entries(standings)) {
    if (s.points > 0 && (!best || s.points > best.points)) best = { uid, name: s.name, points: s.points }
  }
  return best
}

;(async () => {
  const { ref, data } = await loadCurrent()
  let round = data

  // Men's, finished, with a result, not yet scored — oldest first.
  const snap = await db.collection('fixtures').where('status', '==', 'finished').get()
  const pending = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => !f.isTest && !f.editing && f.heroScored !== true && isMen(f) && isClub(f) && hasResult(f))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  if (!pending.length) { note('Matchday Hero: no new matches to score.'); return }

  let scored = 0
  for (const fixture of pending) {
    const points = await playerPoints(fixture.id, fixture)
    await scoreInto(round.standings, fixture.id, points)
    round.countedFixtureIds.push(fixture.id)
    await db.doc(`fixtures/${fixture.id}`).set({ heroScored: true }, { merge: true })
    scored += 1

    if (round.countedFixtureIds.length >= MATCHES_PER_ROUND) {
      // Round complete: lock the winner, archive it, start the next round.
      const winner = decideWinner(round.standings)
      const finished = {
        ...round, status: 'won',
        winnerUid: winner?.uid ?? '', winnerName: winner?.name ?? '', winnerPoints: winner?.points ?? 0,
        decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }
      await db.doc(`heroComp/round-${round.roundNumber}`).set(finished)
      note(`Matchday Hero: round ${round.roundNumber} won by ${winner ? `${winner.name} (${winner.points} pts)` : 'nobody — no points scored'}.`)
      round = freshRound(round.roundNumber + 1)
    }
  }

  await ref.set({ ...round, updatedAt: FieldValue.serverTimestamp() })
  note(`Matchday Hero: scored ${scored} match${scored === 1 ? '' : 'es'}. Now on round ${round.roundNumber}, match ${round.countedFixtureIds.length} of ${MATCHES_PER_ROUND}.`)
})().catch((error) => { console.error('✖', error.message); process.exit(1) })
