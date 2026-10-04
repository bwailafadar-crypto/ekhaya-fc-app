import { collection, onSnapshot, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'

/** Live list of documents in a (sub)collection, e.g. ['polls', id, 'votes']. */
export function useLiveDocs<T extends DocumentData>(segments: string[] | null) {
  const key = segments ? segments.join('/') : ''
  const [state, setState] = useState<{ key: string; items: Array<T & { id: string }>; error: boolean }>({ key: '', items: [], error: false })

  useEffect(() => {
    if (!key) return
    const [first, ...rest] = key.split('/')
    return onSnapshot(
      collection(db, first, ...rest),
      (snapshot) => setState({ key, items: snapshot.docs.map((item) => ({ ...(item.data() as T), id: item.id })), error: false }),
      () => setState({ key, items: [], error: true }),
    )
  }, [key])

  const current = state.key === key && key !== ''
  return { items: current ? state.items : [], loading: Boolean(key) && !current, error: current && state.error }
}
