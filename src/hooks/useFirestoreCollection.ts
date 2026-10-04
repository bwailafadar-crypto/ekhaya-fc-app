import { collection, onSnapshot, type DocumentData } from 'firebase/firestore'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PUBLIC_SOURCES, snapshotStore, type SnapshotState } from '../data/publicSnapshot'
import { db } from '../firebase'

const LOADING: SnapshotState = { status: 'loading' }
const noop = () => () => undefined
const getLoading = () => LOADING

/** Live view of a whole collection, read straight from the database. */
function useDirectCollection<T extends DocumentData>(collectionName: string | null) {
  const [snapshot, setSnapshot] = useState<{
    collectionName: string
    items: Array<T & { id: string }>
    error: string | null
  }>({ collectionName: '', items: [], error: null })

  useEffect(() => {
    if (!collectionName) return
    const unsubscribe = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        setSnapshot({
          collectionName,
          items: snapshot.docs.map((item) => ({ ...item.data() as T, id: item.id })),
          error: null,
        })
      },
      () => {
        setSnapshot({
          collectionName,
          items: [],
          error: 'Could not load this information. Check your connection and try again.',
        })
      },
    )
    return unsubscribe
  }, [collectionName])

  const isCurrentCollection = collectionName !== null && snapshot.collectionName === collectionName
  return {
    items: isCurrentCollection ? snapshot.items : [],
    loading: !isCurrentCollection,
    error: isCurrentCollection ? snapshot.error : null,
  }
}

/**
 * Live view of a collection. Fans get fixtures, the table and teams from the
 * shared public snapshot (1 read); admins always read the collections directly
 * so they see their own changes at once and keep the snapshot up to date.
 */
export function useFirestoreCollection<T extends DocumentData>(collectionName: string, enabled = true) {
  const { role } = useAuth()
  const isStaff = role === 'admin' || role === 'superadmin'
  const source = PUBLIC_SOURCES[collectionName]
  const fromSnapshot = enabled && !isStaff && Boolean(source)
  const store = source ? snapshotStore(source) : null
  const snap = useSyncExternalStore(fromSnapshot && store ? store.subscribe : noop, fromSnapshot && store ? store.getState : getLoading)
  const rows = fromSnapshot && snap.status === 'ready' ? snap.data[collectionName] : undefined
  const snapItems = Array.isArray(rows) ? rows : undefined
  const needDirect = enabled && (!fromSnapshot || snap.status === 'missing' || (snap.status === 'ready' && !snapItems))
  const direct = useDirectCollection<T>(needDirect ? collectionName : null)

  if (snapItems) return { items: snapItems as Array<T & { id: string }>, loading: false, error: null as string | null }
  if (!needDirect) return { items: [] as Array<T & { id: string }>, loading: enabled, error: null as string | null }
  return direct
}
