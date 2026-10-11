import { collection, deleteDoc, doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import { Clapperboard, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import VideoCard from '../components/VideoCard'
import VideoPlayer from '../components/VideoPlayer'
import { useVideos, type ClubVideo } from '../hooks/useVideos'
import { config } from '../config'
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
    // One link per line, optionally "link | title".
    const lines = String(form.get('urls') ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    const fallbackTitle = String(form.get('title') ?? '').trim()
    const rows = lines.map((line) => { const [url, ...rest] = line.split('|').map((part) => part.trim()); return { url, title: rest.join(' | ') || fallbackTitle } })
    const bad = rows.filter((row) => !parseVideo(row.url))
    if (!rows.length || bad.length) { showToast(bad.length ? `This is not a YouTube or Facebook video link: ${bad[0].url.slice(0, 60)}` : 'Paste at least one video link.', 'error'); return }
    if (rows.some((row) => !row.title)) { showToast('Give the videos a title (in the Title box, or after the link: link | title).', 'error'); return }
    const fixtureId = String(form.get('fixtureId') ?? '')
    setBusy(true)
    try {
      const batch = writeBatch(db)
      const now = Date.now()
      rows.slice(0, 50).forEach((row, index) => batch.set(doc(collection(db, 'videos')), { title: row.title.slice(0, 120), url: row.url.slice(0, 300), kind: String(form.get('kind')), ...(fixtureId ? { fixtureId } : {}), createdAt: index === 0 ? serverTimestamp() : Timestamp.fromMillis(now - index * 1000), by: user.uid }))
      await batch.commit()
      showToast(rows.length === 1 ? 'Video added to Ekhaya TV.' : `${Math.min(rows.length, 50)} videos added to Ekhaya TV.`)
      onDone()
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error')
    } finally { setBusy(false) }
  }

  return <Card className="admin-card tv-add">
    <h2>Add a video</h2>
    <p className="live-help">On Facebook or YouTube, open the video, tap <b>Share → Copy link</b>, and paste it here. You can paste several links, one per line, and add a title after each one: <code>link | title</code>.</p>
    <form className="admin-form" onSubmit={(event) => void save(event)}>
      <label className="admin-field"><span>Video links (one per line)</span><textarea name="urls" rows={4} inputMode="url" placeholder={'https://www.facebook.com/…/videos/… | Goal: Allen Chihana v Kamuzu Barracks\nhttps://fb.watch/…'} required /></label>
      <label className="admin-field"><span>Title (for links without their own)</span><input name="title" maxLength={120} placeholder="Highlights: Ekhaya FC 2–0 Kamuzu Barracks" /></label>
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
  // The Facebook feed is heavy on data, so it loads only when the fan asks for it.
  const [showFeed, setShowFeed] = useState(false)
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
    <section className="tv-facebook" aria-label="Latest from Ekhaya FC on Facebook">
      <div className="matchday-section-title"><h2>Latest on Facebook</h2><a href={config.facebookPage} target="_blank" rel="noreferrer">Open page</a></div>
      {showFeed ? <iframe title="Ekhaya FC on Facebook" src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(config.facebookPage)}&tabs=timeline&width=500&height=720&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" />
        : <button type="button" className="tv-facebook-load" onClick={() => setShowFeed(true)}>Show the club's latest Facebook posts and videos</button>}
    </section>
    {playing && <VideoPlayer url={playing.url} title={playing.title} onClose={() => setPlaying(null)} />}
  </>
}
