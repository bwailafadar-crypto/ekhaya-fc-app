import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { NewsPhoto } from '../types'

type NewsPhotosState = { articleId: string | null; items: NewsPhoto[]; error: string | null }

export function useNewsPhotos(articleId: string | undefined) {
  const [state, setState] = useState<NewsPhotosState>({ articleId: null, items: [], error: null })

  useEffect(() => {
    if (!articleId) return
    return onSnapshot(collection(db, 'news', articleId, 'photos'), (snapshot) => {
      const items = snapshot.docs.map((photo) => ({ ...photo.data() as Omit<NewsPhoto, 'id'>, id: photo.id }))
        .sort((left, right) => left.order - right.order)
      setState({ articleId, items, error: null })
    }, () => setState({ articleId, items: [], error: 'Photos could not be loaded.' }))
  }, [articleId])

  const current = Boolean(articleId && state.articleId === articleId)
  return {
    items: current ? state.items : [],
    loading: Boolean(articleId) && !current,
    error: current ? state.error : null,
  }
}