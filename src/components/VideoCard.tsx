import { Clapperboard, Play, Trash2, Users } from 'lucide-react'
import type { ClubVideo } from '../hooks/useVideos'
import { parseVideo } from '../utils/video'

export default function VideoCard({ video, onPlay, onDelete, onMove }: { video: ClubVideo; onPlay: () => void; onDelete?: () => void; onMove?: () => void }) {
  const info = parseVideo(video.url)
  const otherTeam = (video.team ?? 'men') === 'men' ? "Women's" : "Men's"
  return <article className="tv-card">
    <button type="button" className="tv-thumb" onClick={onPlay} aria-label={`Play ${video.title}`}>
      {info?.thumb ? <img src={info.thumb} alt="" loading="lazy" /> : <span className="tv-thumb-fallback"><Clapperboard size={30} aria-hidden="true" /></span>}
      <span className="tv-play"><Play size={20} fill="currentColor" aria-hidden="true" /></span>
      <span className="tv-kind">{video.kind}</span>
    </button>
    <div className="tv-meta"><strong>{video.title}</strong>
      {onMove && <button type="button" aria-label={`Move ${video.title} to ${otherTeam}`} title={`Move to ${otherTeam}`} onClick={onMove}><Users size={15} /></button>}
      {onDelete && <button type="button" aria-label={`Delete ${video.title}`} onClick={onDelete}><Trash2 size={15} /></button>}
    </div>
  </article>
}

