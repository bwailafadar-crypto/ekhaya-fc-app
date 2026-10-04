import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { LeaderRow } from '../utils/leaderboardCalc'

export { POINTS_EXACT, POINTS_RESULT, type LeaderRow } from '../utils/leaderboardCalc'

type Board = { rows: LeaderRow[]; totalFans: number; matches: number }

/** The saved season leaderboard (one document, updated by admins after each match). */
export function useLeaderboard() {
  const [state, setState] = useState<{ board: Board | null; loading: boolean; error: boolean }>({ board: null, loading: true, error: false })
  useEffect(() => onSnapshot(doc(db, 'leaderboard', 'season'), (snapshot) => {
    const data = snapshot.data()
    setState({ board: data ? { rows: Array.isArray(data.rows) ? data.rows : [], totalFans: Number(data.totalFans ?? 0), matches: Number(data.matches ?? 0) } : { rows: [], totalFans: 0, matches: 0 }, loading: false, error: false })
  }, () => setState({ board: null, loading: false, error: true })), [])
  return { rows: state.board?.rows ?? [], totalFans: state.board?.totalFans ?? 0, matches: state.board?.matches ?? 0, loading: state.loading, error: state.error }
}

/** One fan's own league entry (rank even outside the top 100). */
export function useMyLeaderboardEntry(uid: string | undefined) {
  const [state, setState] = useState<{ uid?: string; entry: (LeaderRow & { totalFans?: number }) | null; loading: boolean }>({ entry: null, loading: true })
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'leaderboardEntries', uid), (snapshot) => setState({ uid, entry: snapshot.exists() ? (snapshot.data() as LeaderRow) : null, loading: false }), () => setState({ uid, entry: null, loading: false }))
  }, [uid])
  const current = state.uid === uid
  return { entry: current ? state.entry : null, loading: Boolean(uid) && (!current || state.loading) }
}
