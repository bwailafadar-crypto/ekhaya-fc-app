import { doc, getCountFromServer, onSnapshot, type DocumentData, type Query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'

/**
 * Counts documents with Firestore's count feature (about 1 read per 1,000
 * matches) instead of downloading them. `key` decides when to recount; pass
 * null to skip. Counts are fetched once, not streamed, to save reads.
 */
export function useCounts(key: string | null, build: () => Record<string, Query<DocumentData>>) {
  const [state, setState] = useState<{ key: string | null; counts: Record<string, number>; error: boolean }>({ key: null, counts: {}, error: false })
  useEffect(() => {
    if (!key) return
    let active = true
    const queries = build()
    Promise.all(Object.entries(queries).map(async ([name, query]) => [name, (await getCountFromServer(query)).data().count] as const))
      .then((entries) => { if (active) setState({ key, counts: Object.fromEntries(entries), error: false }) })
      .catch(() => { if (active) setState({ key, counts: {}, error: true }) })
    return () => { active = false }
    // `build` is recreated each render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const ready = key !== null && state.key === key
  return { counts: ready ? state.counts : {}, loading: key !== null && !ready, error: ready && state.error }
}

/** Live view of one document (e.g. the fan's own vote). */
export function useMyDoc<T extends DocumentData>(segments: string[] | null) {
  const path = segments ? segments.join('/') : ''
  const [state, setState] = useState<{ path: string; data: T | null }>({ path: '', data: null })
  useEffect(() => {
    if (!path) return
    const [first, ...rest] = path.split('/')
    return onSnapshot(doc(db, first, ...rest), (snapshot) => setState({ path, data: snapshot.exists() ? (snapshot.data() as T) : null }), () => setState({ path, data: null }))
  }, [path])
  const ready = path !== '' && state.path === path
  return { data: ready ? state.data : null, loading: path !== '' && !ready }
}
