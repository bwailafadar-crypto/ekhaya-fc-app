import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { MatchGps } from '../types'

/** Catapult GPS figures for these matches (one small read each, only when asked). */
export function useMatchGps(fixtureIds: string[]) {
  const key = fixtureIds.filter(Boolean).join(',')
  const [state, setState] = useState<{ key: string; data: Record<string, MatchGps> }>({ key: '', data: {} })
  useEffect(() => {
    if (!key) return
    let active = true
    void Promise.all(key.split(',').map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'matchGps', id))
        return snap.exists() ? [id, snap.data() as MatchGps] as const : null
      } catch { return null }
    })).then((rows) => {
      if (active) setState({ key, data: Object.fromEntries(rows.filter((row): row is readonly [string, MatchGps] => row !== null)) })
    })
    return () => { active = false }
  }, [key])
  return state.key === key ? state.data : {}
}
