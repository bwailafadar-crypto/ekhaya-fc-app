import { collectionGroup, getDocs, type Timestamp } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase'
import type { Fixture } from '../types'
import { useFirestoreCollection } from './useFirestoreCollection'

export const POINTS_EXACT = 3
export const POINTS_RESULT = 1

export type LeaderRow = { uid: string; name: string; points: number; exact: number; results: number; played: number; rank: number }

type StoredPrediction = { uid: string; fixtureId: string; home: number; away: number; name: string; updatedAt: number }

const outcome = (home: number, away: number) => Math.sign(home - away)

/**
 * Season leaderboard from fans' score predictions on finished (non-test) matches.
 * Exact score = 3 points, right result (win/draw/loss) = 1 point.
 */
export function useLeaderboard() {
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const finished = useMemo(() => fixtures.items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest), [fixtures.items])
  // Reload predictions whenever a match finishes or a result is corrected.
  const key = finished.map((fixture) => `${fixture.id}:${fixture.homeScore ?? 0}-${fixture.awayScore ?? 0}`).sort().join('|')
  const [state, setState] = useState<{ key: string | null; predictions: StoredPrediction[]; error: boolean }>({ key: null, predictions: [], error: false })

  useEffect(() => {
    if (fixtures.loading) return
    let active = true
    getDocs(collectionGroup(db, 'predictions'))
      .then((snapshot) => {
        if (!active) return
        const predictions = snapshot.docs.flatMap((item) => {
          const fixtureId = item.ref.parent.parent?.id
          const data = item.data()
          if (!fixtureId || typeof data.home !== 'number' || typeof data.away !== 'number') return []
          return [{ uid: item.id, fixtureId, home: data.home, away: data.away, name: typeof data.name === 'string' ? data.name : 'Fan', updatedAt: (data.updatedAt as Timestamp | undefined)?.toMillis?.() ?? 0 }]
        })
        setState({ key, predictions, error: false })
      })
      .catch(() => { if (active) setState({ key, predictions: [], error: true }) })
    return () => { active = false }
  }, [key, fixtures.loading])

  const rows = useMemo(() => {
    const results = new Map(finished.map((fixture) => [fixture.id, fixture]))
    const byFan = new Map<string, LeaderRow & { nameAt: number }>()
    state.predictions.forEach((prediction) => {
      const fixture = results.get(prediction.fixtureId)
      if (!fixture) return
      const home = fixture.homeScore ?? 0
      const away = fixture.awayScore ?? 0
      const row = byFan.get(prediction.uid) ?? { uid: prediction.uid, name: prediction.name, nameAt: 0, points: 0, exact: 0, results: 0, played: 0, rank: 0 }
      row.played += 1
      if (prediction.home === home && prediction.away === away) { row.exact += 1; row.points += POINTS_EXACT }
      else if (outcome(prediction.home, prediction.away) === outcome(home, away)) { row.results += 1; row.points += POINTS_RESULT }
      // Show the name from the fan's most recent prediction.
      if (prediction.updatedAt >= row.nameAt) { row.name = prediction.name; row.nameAt = prediction.updatedAt }
      byFan.set(prediction.uid, row)
    })
    const sorted = [...byFan.values()].sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
    const ranked: LeaderRow[] = []
    for (const [index, row] of sorted.entries()) {
      const previous = ranked[index - 1]
      const tied = previous && previous.points === row.points && previous.exact === row.exact
      ranked.push({ uid: row.uid, name: row.name, points: row.points, exact: row.exact, results: row.results, played: row.played, rank: tied ? previous.rank : index + 1 })
    }
    return ranked
  }, [finished, state.predictions])

  return { rows, matches: finished.length, loading: fixtures.loading || state.key !== key, error: state.error }
}
