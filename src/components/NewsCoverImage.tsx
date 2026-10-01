import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { NewsItem } from '../types'

type CoverState = { articleId: string | null; photoId: string | null; dataUrl: string | null }

export default function NewsCoverImage({ article, className, alt }: { article: NewsItem; className: string; alt: string }) {
  const [state, setState] = useState<CoverState>({ articleId: null, photoId: null, dataUrl: null })

  useEffect(() => {
    const photoId = article.coverPhotoId
    if (!photoId) return
    return onSnapshot(doc(db, 'news', article.id, 'photos', photoId), (snapshot) => {
      setState({ articleId: article.id, photoId, dataUrl: snapshot.data()?.dataUrl ?? null })
    }, () => setState({ articleId: article.id, photoId, dataUrl: null }))
  }, [article.id, article.coverPhotoId])

  if (!article.coverPhotoId && !article.coverImage) return null
  const current = state.articleId === article.id && state.photoId === article.coverPhotoId
  const source = current ? state.dataUrl || article.coverImage : article.coverImage
  if (!source) return <div className={`${className} news-cover-loading`} aria-hidden="true" />
  return <img className={className} src={source} alt={alt} loading="lazy" decoding="async" />
}