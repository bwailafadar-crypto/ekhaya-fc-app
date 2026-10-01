import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { NewsPhoto } from '../types'

type PhotoState = { articleId: string | null; photoId: string | null; photo: NewsPhoto | null; error: string | null }

export function useNewsPhoto(articleId: string, photoId: string | undefined, enabled = true) {
  const [state, setState] = useState<PhotoState>({ articleId: null, photoId: null, photo: null, error: null })

  useEffect(() => {
    if (!enabled || !photoId) return
    return onSnapshot(doc(db, 'news', articleId, 'photos', photoId), (snapshot) => {
      setState({
        articleId,
        photoId,
        photo: snapshot.exists() ? { ...snapshot.data() as Omit<NewsPhoto, 'id'>, id: snapshot.id } : null,
        error: null,
      })
    }, () => setState({ articleId, photoId, photo: null, error: 'Photo could not be loaded.' }))
  }, [articleId, enabled, photoId])

  const current = state.articleId === articleId && state.photoId === photoId
  return {
    photo: current ? state.photo : null,
    loading: Boolean(enabled && photoId) && !current,
    error: current ? state.error : null,
  }
}