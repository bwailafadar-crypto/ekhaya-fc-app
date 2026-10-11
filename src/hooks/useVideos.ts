import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { VideoKind } from '../utils/video'

export type ClubVideo = { id: string; title: string; url: string; kind: VideoKind; fixtureId?: string; createdAt?: { toMillis?: () => number } }

/** Club videos, newest first (small documents: a title and a link each). */
export function useVideos() {
  const [state, setState] = useState<{ items: ClubVideo[]; loading: boolean }>({ items: [], loading: true })
  useEffect(() => onSnapshot(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(80)),
    (snapshot) => setState({ items: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as ClubVideo), loading: false }),
    () => setState({ items: [], loading: false })), [])
  return state
}

