import { collection, onSnapshot, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'

export function useFirestoreCollection<T extends DocumentData>(collectionName: string) {
  const [snapshot, setSnapshot] = useState<{
    collectionName: string
    items: Array<T & { id: string }>
    error: string | null
  }>({ collectionName: '', items: [], error: null })

  useEffect(() => {
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

  const isCurrentCollection = snapshot.collectionName === collectionName
  return {
    items: isCurrentCollection ? snapshot.items : [],
    loading: !isCurrentCollection,
    error: isCurrentCollection ? snapshot.error : null,
  }
}