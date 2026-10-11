import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch } from 'firebase/firestore'
import { ChevronRight, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import type { Fixture } from '../types'
import { compressImage } from '../utils/compressImage'
import { autoStories, markSeen, postedStory, seenStories, STORY_HOURS, STORY_LABELS, STORY_LINKS, type Story, type StoredStory, type StoryLabel } from '../utils/stories'
import TeamLogo from './TeamLogo'
import { useToast } from './ToastContext'
import { Button } from './UI'

const SECONDS = { auto: 5, post: 7 }

/** Club stories that are still live (24 h), newest first. Only small thumbnails are read here. */
function usePostedStories(now: number) {
  const [items, setItems] = useState<Story[]>([])
  useEffect(() => onSnapshot(
    query(collection(db, 'stories'), where('expiresAt', '>', Timestamp.fromMillis(now))),
    (snapshot) => setItems(snapshot.docs.map((item) => postedStory(item.id, item.data() as StoredStory, now)).filter((item): item is Story => Boolean(item))),
    () => setItems([]),
  ), [now])
  return items
}

export default function StoriesBar({ fixtures }: { fixtures: Fixture[] }) {
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const [now] = useState(() => Date.now())
  const posted = usePostedStories(now)
  const stories = [...[...posted].sort((a, b) => b.createdAt - a.createdAt), ...autoStories(fixtures, now)]
  const [seen, setSeen] = useState(seenStories)
  // The list is frozen while watching, so stories don't reorder as they become "seen".
  const [open, setOpen] = useState<{ list: Story[]; index: number } | null>(null)
  const [composing, setComposing] = useState(false)
  // Unseen stories first, like the big social apps.
  const ordered = [...stories.filter((story) => !seen.has(story.id)), ...stories.filter((story) => seen.has(story.id))]

  const onSeen = useCallback((id: string) => { markSeen(id); setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id))) }, [])
  const closeViewer = useCallback(() => setOpen(null), [])
  if (!ordered.length && !isAdmin) return null

  return <>
    <section className="stories-bar" aria-label="Club stories">
      {isAdmin && <button type="button" className="story-bubble story-add" onClick={() => setComposing(true)}>
        <span className="story-ring"><span className="story-face"><Plus size={22} aria-hidden="true" /></span></span>
        <small>Add story</small>
      </button>}
      {ordered.map((story, index) => <button type="button" key={story.id} className={`story-bubble${seen.has(story.id) ? ' seen' : ''}${story.tone === 'live' ? ' live' : ''}`} onClick={() => setOpen({ list: ordered, index })}>
        <span className="story-ring"><span className="story-face">
          {story.thumb ? <img src={story.thumb} alt="" /> : story.crest ? <TeamLogo name={story.crest} crest /> : <span className="story-emoji">★</span>}
        </span></span>
        <small>{story.label}</small>
      </button>)}
    </section>
    {open && <StoryViewer stories={open.list} start={open.index} isAdmin={isAdmin} onSeen={onSeen} onClose={closeViewer} />}
    {composing && <StoryComposer onClose={() => setComposing(false)} />}
  </>
}

function StoryViewer({ stories, start, isAdmin, onSeen, onClose }: { stories: Story[]; start: number; isAdmin: boolean; onSeen: (id: string) => void; onClose: () => void }) {
  const [index, setIndex] = useState(start)
  const [paused, setPaused] = useState(false)
  const [images, setImages] = useState<Record<string, string>>({})
  const pressedAt = useRef(0)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const story = stories[index]

  const next = useCallback(() => setIndex((value) => { if (value + 1 >= stories.length) { onClose(); return value } return value + 1 }), [stories.length, onClose])
  const prev = () => setIndex((value) => Math.max(0, value - 1))

  useEffect(() => { if (story) onSeen(story.id) }, [story, onSeen])
  // Full photos load only when watched (and the next one is fetched ahead).
  useEffect(() => {
    let active = true
    for (const item of [stories[index], stories[index + 1]]) {
      if (!item?.hasImage || images[item.id]) continue
      void getDoc(doc(db, 'storyImages', item.id)).then((snap) => {
        const image = snap.data()?.image
        if (active && typeof image === 'string') setImages((prevImages) => ({ ...prevImages, [item.id]: image }))
      }).catch(() => undefined)
    }
    return () => { active = false }
  }, [index, stories, images])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key === 'ArrowRight') next(); if (event.key === 'ArrowLeft') prev() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [next, onClose])

  if (!story) return null
  const image = story.hasImage ? images[story.id] ?? story.thumb : null

  async function remove() {
    if (!window.confirm('Delete this story for everyone?')) return
    try {
      await Promise.all([deleteDoc(doc(db, 'stories', story.id)), deleteDoc(doc(db, 'storyImages', story.id)).catch(() => undefined)])
      showToast('Story deleted.')
      onClose()
    } catch { showToast('The story was not deleted.', 'error') }
  }

  return createPortal(<div className={`story-viewer tone-${story.tone ?? 'post'}`} role="dialog" aria-modal="true" aria-label={`${story.label}: ${story.title}`}>
    <div className="story-progress">{stories.map((item, i) => <span key={item.id}><i className={i < index ? 'done' : i === index ? 'run' : ''} style={i === index ? { animationDuration: `${SECONDS[item.source]}s`, animationPlayState: paused ? 'paused' : 'running' } : undefined} onAnimationEnd={i === index ? next : undefined} /></span>)}</div>
    <div className="story-top">
      <span className="story-tag">{story.label}</span>
      <div>
        {isAdmin && story.source === 'post' && <button type="button" aria-label="Delete story" onClick={() => void remove()}><Trash2 size={18} /></button>}
        <button type="button" aria-label="Close stories" onClick={onClose}><X size={22} /></button>
      </div>
    </div>
    <div className="story-stage"
      onPointerDown={() => { pressedAt.current = Date.now(); setPaused(true) }}
      onPointerUp={(event) => { setPaused(false); if (Date.now() - pressedAt.current > 350) return; const box = event.currentTarget.getBoundingClientRect(); if (event.clientX - box.left < box.width / 3) prev(); else next() }}
      onPointerLeave={() => setPaused(false)}>
      {image ? <img className="story-image" src={image} alt="" draggable={false} />
        : <div className="story-card">{story.crest && <TeamLogo name={story.crest} crest />}<strong>{story.title}</strong>{story.text && <span>{story.text}</span>}</div>}
      {image && <div className="story-caption"><strong>{story.title}</strong>{story.text && <span>{story.text}</span>}</div>}
    </div>
    {story.path && <button type="button" className="story-open" onClick={() => { onClose(); navigate(story.path ?? '/') }}>Open <ChevronRight size={16} aria-hidden="true" /></button>}
  </div>, document.body)
}

function StoryComposer({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  async function pick(chosen: File | undefined) {
    if (!chosen) return
    try { setPreview(await compressImage(chosen, { maxDimension: 320, maxBytes: 40 * 1024 })); setFile(chosen) } catch (error) { showToast(error instanceof Error ? error.message : 'This photo could not be used.', 'error') }
  }

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const form = new FormData(event.currentTarget)
    const caption = String(form.get('caption') ?? '').trim()
    if (!caption && !file) { showToast('Add a photo or a line of text.', 'error'); return }
    setBusy(true)
    try {
      const ref = doc(collection(db, 'stories'))
      const batch = writeBatch(db)
      let thumb: string | null = null
      if (file) {
        const [full, small] = await Promise.all([compressImage(file, { maxDimension: 1080, maxBytes: 220 * 1024 }), compressImage(file, { maxDimension: 160, maxBytes: 12 * 1024 })])
        thumb = small
        batch.set(doc(db, 'storyImages', ref.id), { image: full, createdAt: serverTimestamp() })
      }
      const path = String(form.get('path') ?? '')
      batch.set(ref, {
        caption: caption.slice(0, 160), label: String(form.get('label')) as StoryLabel, thumb, hasImage: Boolean(file),
        ...(path ? { path } : {}),
        createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + STORY_HOURS * 3_600_000), by: user.uid,
      })
      await batch.commit()
      showToast('Story posted. Fans see it for 24 hours.')
      onClose()
    } catch (error) {
      showToast(error instanceof Error ? `Not posted: ${error.message}` : 'Not posted. Check your connection.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(<div className="story-composer-backdrop" role="dialog" aria-modal="true" aria-label="Add a story">
    <form className="story-composer" onSubmit={(event) => void post(event)}>
      <div className="story-composer-head"><h2>Add a story</h2><button type="button" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
      <label className="story-photo-pick">
        <input type="file" accept="image/*" onChange={(event) => void pick(event.currentTarget.files?.[0])} />
        {preview ? <img src={preview} alt="Story photo preview" /> : <span><ImagePlus size={22} aria-hidden="true" />Choose or take a photo</span>}
      </label>
      <label className="admin-field"><span>Text</span><textarea name="caption" maxLength={160} rows={2} placeholder="e.g. Warm-up done. Kick-off in 30 minutes!" /></label>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Type</span><select name="label" defaultValue="Match day">{STORY_LABELS.map((label) => <option key={label}>{label}</option>)}</select></label>
        <label className="admin-field"><span>Open button</span><select name="path" defaultValue="">{STORY_LINKS.map((link) => <option key={link.path} value={link.path}>{link.label}</option>)}</select></label>
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post story (24 hours)'}</Button>
    </form>
  </div>, document.body)
}
