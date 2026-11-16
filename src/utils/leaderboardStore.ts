// Admin-only: recalculates the season prediction league and saves it, so fans
// read one small document instead of every prediction ever made.
import { collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Fixture } from '../types'
import { isPlayed } from './football'
import { fanPointsTable, rankPredictions, type ScoredPrediction } from './leaderboardCalc'

export const LEADERBOARD_TOP = 100

let running: Promise<number> | null = null

/**
 * Recalculates the league. Automatic runs (force = false) take a short lock so
 * only one admin's app does the work when several are open.
 */
export function recalculateLeaderboard(force = true) {
  running ??= doRecalculate(force).finally(() => { running = null })
  return running
}

function hash(text: string) {
  let value = 5381
  for (let i = 0; i < text.length; i += 1) value = ((value << 5) + value + text.charCodeAt(i)) | 0
  return (value >>> 0).toString(36)
}

async function doRecalculate(force: boolean) {
  const fixtures = await getDocs(collection(db, 'fixtures'))
  const finished = fixtures.docs
    .map((item) => ({ ...(item.data() as Fixture), id: item.id }))
    .filter((fixture) => isPlayed(fixture) && !fixture.isTest)
  if (!force) {
    // Same results within the same 10 minutes: another admin is already on it.
    const results = finished.map((fixture) => `${fixture.id}:${fixture.homeScore ?? 0}-${fixture.awayScore ?? 0}`).sort().join('|')
    const lock = doc(db, 'alertsSent', `leaderboard-${hash(results)}-${Math.floor(Date.now() / 600000)}`)
    try { await setDoc(lock, { title: 'leaderboard', createdAt: serverTimestamp() }) } catch { return -1 }
  }
  const predictionSets = await Promise.all(finished.map((fixture) => getDocs(collection(db, 'fixtures', fixture.id, 'predictions'))))
  const predictions: ScoredPrediction[] = predictionSets.flatMap((snapshot, index) => snapshot.docs.flatMap((item) => {
    const data = item.data()
    if (typeof data.home !== 'number' || typeof data.away !== 'number') return []
    return [{ uid: item.id, fixtureId: finished[index].id, home: data.home, away: data.away, name: typeof data.name === 'string' ? data.name : 'Fan', updatedAt: data.updatedAt?.toMillis?.() ?? 0 }]
  }))
  const rows = rankPredictions(finished.map((fixture) => ({ id: fixture.id, homeScore: fixture.homeScore ?? 0, awayScore: fixture.awayScore ?? 0 })), predictions)

  // Remove entries for fans who are no longer on the board.
  const existing = await getDocs(collection(db, 'leaderboardEntries'))
  const keep = new Set(rows.map((row) => row.uid))
  const stale = existing.docs.filter((item) => !keep.has(item.id))
  // Only rewrite fans whose numbers actually changed (saves daily write quota).
  const current = new Map(existing.docs.map((item) => [item.id, item.data()]))
  const changed = rows.filter((row) => {
    const old = current.get(row.uid)
    return !old || old.rank !== row.rank || old.points !== row.points || old.exact !== row.exact || old.results !== row.results
      || old.played !== row.played || old.name !== row.name || old.totalFans !== rows.length
  })

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [
    (batch) => batch.set(doc(db, 'leaderboard', 'season'), { rows: rows.slice(0, LEADERBOARD_TOP), totalFans: rows.length, matches: finished.length, updatedAt: serverTimestamp() }),
    ...changed.map((row) => (batch: ReturnType<typeof writeBatch>) => batch.set(doc(db, 'leaderboardEntries', row.uid), { ...row, totalFans: rows.length, updatedAt: serverTimestamp() })),
    ...stale.map((item) => (batch: ReturnType<typeof writeBatch>) => batch.delete(item.ref)),
  ]
  await commitAll(writes)
  await recalculateFanPoints(fixtures.docs.map((item) => ({ ...(item.data() as Fixture), id: item.id })), rows)
  return rows.length
}

async function commitAll(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = writeBatch(db)
    writes.slice(i, i + 450).forEach((write) => write(batch))
    await batch.commit()
  }
}

/**
 * Fan points: predictions + man-of-the-match votes + poll votes + stadium
 * check-ins + friends invited. Saved as one board (leaderboard/fans) plus one
 * small document per fan (fanPoints/{uid}).
 */
async function recalculateFanPoints(allFixtures: Fixture[], predictionRows: Array<{ uid: string; points: number; name: string }>) {
  const real = allFixtures.filter((fixture) => !fixture.isTest)
  const played = real.filter((fixture) => isPlayed(fixture) || fixture.status === 'live')
  const safe = async <T,>(work: () => Promise<T>, fallback: T) => { try { return await work() } catch { return fallback } }
  const [checkinSets, polls, referrals, fanCards, users] = await Promise.all([
    Promise.all(played.map((fixture) => safe(() => getDocs(collection(db, 'fixtures', fixture.id, 'checkins')), null))),
    safe(() => getDocs(collection(db, 'polls')), null),
    safe(() => getDocs(collection(db, 'referrals')), null),
    safe(() => getDocs(collection(db, 'fanCards')), null),
    // Profile names (readable by the superadmin), so voters show by name, not "Fan".
    safe(() => getDocs(collection(db, 'users')), null),
  ])
  const pollSets = polls ? await Promise.all(polls.docs.map((poll) => safe(() => getDocs(collection(db, 'polls', poll.id, 'votes')), null))) : []
  const names: Record<string, string> = {}
  users?.docs.forEach((item) => { const name = item.data().fullName; if (typeof name === 'string' && name.trim()) names[item.id] = name.trim() })
  fanCards?.docs.forEach((item) => { const name = item.data().name; if (typeof name === 'string' && name) names[item.id] = name })
  predictionRows.forEach((row) => { if (!names[row.uid] && row.name && row.name !== 'Fan') names[row.uid] = row.name })
  const table = fanPointsTable({
    predictionPoints: predictionRows,
    pollVoters: pollSets.flatMap((set) => set?.docs.map((item) => item.id) ?? []),
    checkIns: checkinSets.flatMap((set) => set?.docs.map((item) => ({ uid: item.id, name: typeof item.data().name === 'string' ? item.data().name : undefined })) ?? []),
    inviters: referrals?.docs.map((item) => String(item.data().by ?? '')).filter(Boolean) ?? [],
    names,
  })
  const existing = await getDocs(collection(db, 'fanPoints'))
  const current = new Map(existing.docs.map((item) => [item.id, item.data()]))
  const keep = new Set(table.map((row) => row.uid))
  const changed = table.filter((row) => { const old = current.get(row.uid); return !old || old.points !== row.points || old.rank !== row.rank || old.name !== row.name || old.totalFans !== table.length || JSON.stringify(old.breakdown) !== JSON.stringify(row.breakdown) })
  await commitAll([
    (batch) => batch.set(doc(db, 'leaderboard', 'fans'), { rows: table.slice(0, LEADERBOARD_TOP).map(({ breakdown: _breakdown, ...row }) => { void _breakdown; return row }), totalFans: table.length, updatedAt: serverTimestamp() }),
    ...changed.map((row) => (batch: ReturnType<typeof writeBatch>) => batch.set(doc(db, 'fanPoints', row.uid), { ...row, totalFans: table.length, updatedAt: serverTimestamp() })),
    ...existing.docs.filter((item) => !keep.has(item.id)).map((item) => (batch: ReturnType<typeof writeBatch>) => batch.delete(item.ref)),
  ])
}
