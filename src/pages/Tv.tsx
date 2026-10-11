import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { Clapperboard, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import VideoCard from '../components/VideoCard'
import VideoPlayer from '../components/VideoPlayer'
import { useVideos, type ClubVideo } from '../hooks/useVideos'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture } from '../types'
import { formatMalawiDate, sortByDate } from '../utils/football'
import { parseVideo, VIDEO_KINDS, type VideoKind } from '../utils/video'

function AddVideo({ fixtures, onDone }: { fixtures: Fixture[]; onDone: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const recent = sortByDate(fixtures.filter((fixture) => !fixture.isTest && fixture.status !== 'upcoming'), 'desc').slice(0, 12)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const form = new FormData(event.currentTarget)
    const url = String(form.get('url') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()
    if (!parseVideo(url)) { showToast('Paste a YouTube or Facebook video link.', 'error'); return }
    if (!title) { showToast('Give the video a title.', 'error'); return }
    const fixtureId = String(form.get('fixtureId') ?? '')
    setBusy(true)
    try {
      await addDoc(collection(db, 'videos'), { title: title.slice(0, 120), url: url.slice(0, 300), kind: String(form.get('kind')), ...(fixtureId ? { fixtureId } : {}), createdAt: serverTimestamp(), by: user.uid })
      showToast('Video added to Ekhaya TV.')
      onDone()
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error')
    } finally { setBusy(false) }
  }

  return <Card className="admin-card tv-add">
    <h2>Add a video</h2>
    <p className="live-help">Upload the clip to the club's YouTube or Facebook page first, then paste its link here.</p>
    <form className="admin-form" onSubmit={(event) => void save(event)}>
      <label className="admin-field"><span>Video link</span><input name="url" inputMode="url" placeholder="https://youtu.be/… or https://www.facebook.com/…/videos/…" required /></label>
      <label className="admin-field"><span>Title</span><input name="title" maxLength={120} placeholder="Highlights: Ekhaya FC 2–0 Kamuzu Barracks" required /></label>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Type</span><select name="kind" defaultValue="Highlights">{VIDEO_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label className="admin-field"><span>Match (optional)</span><select name="fixtureId" defaultValue=""><option value="">Not about one match</option>{recent.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} v {fixture.away} · {formatMalawiDate(fixture.date)}</option>)}</select></label>
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add to Ekhaya TV'}</Button>
    </form>
  </Card>
}

export default function Tv() {
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const { showToast } = useToast()
  const { items, loading } = useVideos()
  const fixtures = useFirestoreCollection<Fixture>('fixtures', isAdmin)
  const [kind, setKind] = useState<VideoKind | 'All'>('All')
  const [playing, setPlaying] = useState<ClubVideo | null>(null)
  const [adding, setAdding] = useState(false)
  const shown = kind === 'All' ? items : items.filter((video) => video.kind === kind)
  const kinds = VIDEO_KINDS.filter((item) => items.some((video) => video.kind === item))

  async function remove(video: ClubVideo) {
    if (!window.confirm(`Remove "${video.title}" from Ekhaya TV?`)) return
    try { await deleteDoc(doc(db, 'videos', video.id)); showToast('Video removed.') } catch { showToast('The video was not removed.', 'error') }
  }

  return <>
    <PageHeader eyebrow="Watch" title="Ekhaya TV" description="Highlights, goals, interviews and training." action={isAdmin ? <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={() => setAdding((value) => !value)}>{adding ? 'Close' : 'Add video'}</Button> : undefined} />
    {adding && <AddVideo fixtures={fixtures.items} onDone={() => setAdding(false)} />}
    {kinds.length > 1 && <div className="tv-filter" role="group" aria-label="Video type">{(['All', ...kinds] as const).map((item) => <button key={item} type="button" className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{item}</button>)}</div>}
    {loading ? <div className="tv-grid"><Skeleton /><Skeleton /></div>
      : shown.length ? <div className="tv-grid">{shown.map((video) => <VideoCard key={video.id} video={video} onPlay={() => setPlaying(video)} onDelete={isAdmin ? () => void remove(video) : undefined} />)}</div>
      : <Card><EmptyState icon={Clapperboard} title="No videos yet" description={isAdmin ? 'Tap "Add video" and paste a YouTube or Facebook link.' : 'Match highlights and interviews will appear here.'} /></Card>}
    {playing && <VideoPlayer url={playing.url} title={playing.title} onClose={() => setPlaying(null)} />}
  </>
}
