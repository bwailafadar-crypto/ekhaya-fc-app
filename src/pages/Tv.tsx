import { arrayUnion, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import { Clapperboard, MonitorPlay, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { dispatchWorkflow } from '../utils/githubAlerts'
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
import { useFlag } from '../hooks/useFlag'

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

type YoutubeConfig = { channel?: string; channelId?: string; channelTitle?: string; lastSync?: { toMillis?: () => number }; lastAdded?: number; inFeed?: number; live?: { id: string; title: string } | null; error?: string; hidden?: string[] }

function useYoutubeConfig() {
  const [cfg, setCfg] = useState<YoutubeConfig>({})
  useEffect(() => onSnapshot(doc(db, 'tvConfig', 'youtube'), (snap) => setCfg((snap.data() as YoutubeConfig) ?? {}), () => setCfg({})), [])
  return cfg
}

/** Admin: link the club's YouTube channel; new uploads then appear here on their own. */
function YoutubeConnect({ cfg }: { cfg: YoutubeConfig }) {
  const { showToast } = useToast()
  const [value, setValue] = useState(cfg.channel ?? '')
  const [busy, setBusy] = useState(false)
  const syncedAt = cfg.lastSync?.toMillis?.()

  async function sync(quiet = false) {
    try { await dispatchWorkflow('sync-youtube.yml'); if (!quiet) showToast('Checking YouTube… new videos appear here in about a minute.') }
    catch (error) { showToast((error as Error).message === 'no-key' ? 'Saved. Videos come in automatically every 2 hours (add the GitHub key in Admin → Alerts for instant sync).' : 'Saved. The next automatic check brings the videos in.', 'info') }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const channel = value.trim()
    if (!/youtube\.com|youtu\.be|^@[\w.-]+$|^UC[\w-]{22}$/i.test(channel)) { showToast('Paste the channel link, like https://www.youtube.com/@EkhayaFC', 'error'); return }
    setBusy(true)
    try { await setDoc(doc(db, 'tvConfig', 'youtube'), { channel, updatedAt: serverTimestamp() }, { merge: true }); await sync(true); showToast('YouTube channel connected. Videos are on their way.') }
    catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') }
    finally { setBusy(false) }
  }

  return <Card className="admin-card tv-yt">
    <div className="fz-card-heading"><MonitorPlay size={18} aria-hidden="true" /><div><h2>YouTube channel</h2><span>{cfg.channelTitle ? `Connected: ${cfg.channelTitle}` : cfg.channel ? 'Connecting…' : 'Not connected'}</span></div></div>
    <form className="tv-yt-form" onSubmit={(event) => void save(event)}>
      <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="url" placeholder="https://www.youtube.com/@EkhayaFC" aria-label="YouTube channel link" />
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : cfg.channel ? 'Save' : 'Connect'}</Button>
    </form>
    {cfg.error ? <p className="te-problems-title">⚠ {cfg.error}. Check the link.</p>
      : syncedAt ? <p className="live-help">Last checked {new Date(syncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {cfg.inFeed ?? 0} recent videos on the channel{cfg.lastAdded ? `, ${cfg.lastAdded} new added` : ''}. New uploads come in every 2 hours by themselves.</p>
      : cfg.channel ? <p className="live-help">Waiting for the first check…</p>
      : <p className="live-help">Open the club's channel on YouTube, copy the link from the address bar (or Share → Copy link) and paste it here. Every new upload then shows on Ekhaya TV by itself, and a LIVE banner appears when the club goes live.</p>}
    {cfg.channel && <button type="button" className="shop-link" onClick={() => void sync()}><RefreshCw size={14} aria-hidden="true" /> Sync now</button>}
  </Card>
}

export default function Tv() {
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const { showToast } = useToast()
  const { items, loading } = useVideos()
  const yt = useYoutubeConfig()
  const fixtures = useFirestoreCollection<Fixture>('fixtures', isAdmin)
  const [kind, setKind] = useState<VideoKind | 'All'>('All')
  const [playing, setPlaying] = useState<ClubVideo | null>(null)
  const [adding, setAdding] = useState(false)
  // The Facebook feed is heavy on data, so it loads only when the fan asks for it.
  const [showFeed, setShowFeed] = useState(false)
  const open = useFlag('ekhayaTv')
  const shown = kind === 'All' ? items : items.filter((video) => video.kind === kind)
  const kinds = VIDEO_KINDS.filter((item) => items.some((video) => video.kind === item))

  async function remove(video: ClubVideo) {
    if (!window.confirm(`Remove "${video.title}" from Ekhaya TV?`)) return
    try {
      await deleteDoc(doc(db, 'videos', video.id))
      // Keep a YouTube video out, so the next sync doesn't bring it back.
      if (video.id.startsWith('yt-')) await setDoc(doc(db, 'tvConfig', 'youtube'), { hidden: arrayUnion(video.id.slice(3)) }, { merge: true })
      showToast('Video removed.')
    } catch { showToast('The video was not removed.', 'error') }
  }

  // Fans see "Coming soon" until the club switches Ekhaya TV on (Admin → App health).
  if (!open && !isAdmin) return <>
    <PageHeader eyebrow="Watch" title="Ekhaya TV" description="Highlights, goals, interviews and training." />
    <Card className="tv-soon">
      <span className="tv-soon-icon" aria-hidden="true"><Clapperboard size={34} /></span>
      <span className="tv-soon-badge">Coming soon</span>
      <h2>Ekhaya TV is on its way</h2>
      <p>Match highlights, every goal, player interviews and training videos, all in one place. Watch this space.</p>
    </Card>
  </>

  return <>
    {!open && <p className="tv-soon-admin">Fans see <strong>Coming soon</strong> on this page. Switch on "Ekhaya TV open to fans" in Admin → App health when it's ready.</p>}
    <PageHeader eyebrow="Watch" title="Ekhaya TV" description="Highlights, goals, interviews and training." action={isAdmin ? <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={() => setAdding((value) => !value)}>{adding ? 'Close' : 'Add video'}</Button> : undefined} />
    {isAdmin && <YoutubeConnect key={yt.channel ?? ''} cfg={yt} />}
    {adding && <AddVideo fixtures={fixtures.items} onDone={() => setAdding(false)} />}
    {yt.live && <button type="button" className="tv-live" onClick={() => setPlaying({ id: `live-${yt.live!.id}`, title: yt.live!.title, url: `https://www.youtube.com/watch?v=${yt.live!.id}`, kind: 'Highlights' })}>
      <span className="tv-live-dot" aria-hidden="true" />LIVE NOW<b>{yt.live.title}</b><span className="tv-live-cta">Watch</span>
    </button>}
    {yt.channelId && <a className="tv-subscribe" href={`https://www.youtube.com/channel/${yt.channelId}?sub_confirmation=1`} target="_blank" rel="noopener noreferrer"><MonitorPlay size={18} aria-hidden="true" /> Subscribe to {yt.channelTitle || 'Ekhaya FC'} on YouTube</a>}
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
