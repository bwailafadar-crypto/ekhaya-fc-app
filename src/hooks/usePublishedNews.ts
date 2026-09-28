import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { NewsItem } from '../types'

export function usePublishedNews() {
  const [state, setState] = useState<{ items: NewsItem[]; loading: boolean; error: string | null }>({
    items: [], loading: true, error: null,
  })

  useEffect(() => onSnapshot(
    query(collection(db, 'news'), where('status', '==', 'published')),
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({ ...item.data() as DocumentData, id: item.id }) as NewsItem)
        .sort((left, right) => right.publishedDate.localeCompare(left.publishedDate))
      setState({ items, loading: false, error: null })
    },
    () => setState({ items: [], loading: false, error: 'News could not be loaded. Check your connection and try again.' }),
  ), [])

  return state
}