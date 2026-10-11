import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useVideos, type ClubVideo } from '../hooks/useVideos'
import type { Fixture } from '../types'
import { compressImage } from '../utils/compressImage'
import { useToast } from './ToastContext'
import VideoCard from './VideoCard'
import VideoPlayer from './VideoPlayer'

type Photo = { id: string; thumb: string; caption?: string; createdAt?: { toMillis?: () => number } }
const MAX_UPLOAD = 12

/** Videos and photos from one match (match centre). Only thumbnails load until a photo is opened. */
export default function MatchMedia({ fixture }: { fixture: Fixture }) {
  const { role, user } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const { showToast } = useToast()
  const videos = useVideos().items.filter((video) => video.fixtureId === fixture.id)
  const [photos, setPhotos] = useState<{ fixtureId: string; items: Photo[] }>({ fixtureId: '', items: [] })
  const [open, setOpen] = useState<number | null>(null)
  const [playing, setPlaying] = useState<ClubVideo | null>(null)
  const [uploading, setUploading] = useState('')

  useEffect(() => onSnapshot(query(collection(db, 'matchPhotos'), where('fixtureId', '==', fixture.id)),
    (snapshot) => setPhotos({ fixtureId: fixture.id, items: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Photo).sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)) }),
    () => setPhotos({ fixtureId: fixture.id, items: [] })), [fixture.id])
  const list = photos.fixtureId === fixture.id ? photos.items : []

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = [...(input.files ?? [])].slice(0, MAX_UPLOAD)
    input.value = ''
    if (!files.length || !user) return
    let done = 0
    for (const file of files) {
      setUploading(`Uploading ${done + 1} of ${files.length}…`)
      try {
        const [image, thumb] = await Promise.all([compressImage(file, { maxDimension: 1280, maxBytes: 220 * 1024 }), compressImage(file, { maxDimension: 240, maxBytes: 14 * 1024 })])
        const ref = doc(collection(db, 'matchPhotos'))
        const batch = writeBatch(db)
        batch.set(doc(db, 'matchPhotoImages', ref.id), { image, createdAt: serverTimestamp() })
        batch.set(ref, { fixtureId: fixture.id, thumb, createdAt: serverTimestamp(), by: user.uid })
        await batch.commit()
        done += 1
      } catch (error) {
        showToast(error instanceof Error ? `A photo was skipped: ${error.message}` : 'A photo was skipped.', 'error')
      }
    }
    setUploading('')
    if (done) showToast(`${done} photo${done === 1 ? '' : 's'} added to the match gallery.`)
  }

  if (!isAdmin && !videos.length && !list.length) return null
  return <section className="match-media" aria-label="Match videos and photos">
    {videos.length > 0 && <>
      <div className="matchday-section-title"><h2>Videos</h2><span>{videos.length}</span></div>
      <div className="match-media-videos">{videos.map((video) => <VideoCard key={video.id} video={video} onPlay={() => setPlaying(video)} />)}</div>
    </>}
    <div className="matchday-section-title"><h2>Photos</h2><span>{list.length ? `${list.length} photo${list.length === 1 ? '' : 's'}` : ''}</span></div>
    {list.length > 0 && <div className="match-gallery">{list.map((photo, index) => <button type="button" key={photo.id} onClick={() => setOpen(index)} aria-label={`Open photo ${index + 1}`}><img src={photo.thumb} alt="" loading="lazy" /></button>)}</div>}
    {isAdmin && <label className="match-gallery-add">
      <input type="file" accept="image/*" multiple disabled={Boolean(uploading)} onChange={(event) => void upload(event)} />
      <ImagePlus size={18} aria-hidden="true" />{uploading || `Add match photos (up to ${MAX_UPLOAD} at a time)`}
    </label>}
    {open != null && list[open] && <PhotoViewer photos={list} start={open} canDelete={isAdmin} onClose={() => setOpen(null)} />}
    {playing && <VideoPlayer url={playing.url} title={playing.title} onClose={() => setPlaying(null)} />}
  </section>
}

function PhotoViewer({ photos, start, canDelete, onClose }: { photos: Photo[]; start: number; canDelete: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const [images, setImages] = useState<Record<string, string>>({})
  const [touchX, setTouchX] = useState<number | null>(null)
  const { showToast } = useToast()
  const photo = photos[index]
  const go = (step: number) => setIndex((value) => Math.min(photos.length - 1, Math.max(0, value + step)))

  useEffect(() => {
    let active = true
    for (const item of [photos[index], photos[index + 1]]) {
      if (!item || images[item.id]) continue
      void getDoc(doc(db, 'matchPhotoImages', item.id)).then((snap) => { const image = snap.data()?.image; if (active && typeof image === 'string') setImages((prev) => ({ ...prev, [item.id]: image })) }).catch(() => undefined)
    }
    return () => { active = false }
  }, [index, photos, images])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key === 'ArrowRight') go(1); if (event.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  })

  if (!photo) return null
  async function remove() {
    if (!window.confirm('Delete this photo for everyone?')) return
    try { await Promise.all([deleteDoc(doc(db, 'matchPhotos', photo.id)), deleteDoc(doc(db, 'matchPhotoImages', photo.id)).catch(() => undefined)]); showToast('Photo deleted.'); onClose() } catch { showToast('The photo was not deleted.', 'error') }
  }

  return createPortal(<div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${photos.length}`}
    onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
    onTouchEnd={(event) => { if (touchX == null) return; const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); setTouchX(null) }}>
    <div className="photo-viewer-top"><span>{index + 1} / {photos.length}</span><div>{canDelete && <button type="button" aria-label="Delete photo" onClick={() => void remove()}><Trash2 size={18} /></button>}<button type="button" aria-label="Close photos" onClick={onClose}><X size={22} /></button></div></div>
    <div className="photo-viewer-stage"><img src={images[photo.id] ?? photo.thumb} alt="" className={images[photo.id] ? '' : 'loading'} /></div>
    {index > 0 && <button type="button" className="photo-nav prev" aria-label="Previous photo" onClick={() => go(-1)}><ChevronLeft size={26} /></button>}
    {index < photos.length - 1 && <button type="button" className="photo-nav next" aria-label="Next photo" onClick={() => go(1)}><ChevronRight size={26} /></button>}
  </div>, document.body)
}
