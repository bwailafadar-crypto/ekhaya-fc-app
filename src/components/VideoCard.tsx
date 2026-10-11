import { Clapperboard, Play, Trash2 } from 'lucide-react'
import type { ClubVideo } from '../hooks/useVideos'
import { parseVideo } from '../utils/video'

export default function VideoCard({ video, onPlay, onDelete }: { video: ClubVideo; onPlay: () => void; onDelete?: () => void }) {
  const info = parseVideo(video.url)
  return <article className="tv-card">
    <button type="button" className="tv-thumb" onClick={onPlay} aria-label={`Play ${video.title}`}>
      {info?.thumb ? <img src={info.thumb} alt="" loading="lazy" /> : <span className="tv-thumb-fallback"><Clapperboard size={30} aria-hidden="true" /></span>}
      <span className="tv-play"><Play size={20} fill="currentColor" aria-hidden="true" /></span>
      <span className="tv-kind">{video.kind}</span>
    </button>
    <div className="tv-meta"><strong>{video.title}</strong>{onDelete && <button type="button" aria-label={`Delete ${video.title}`} onClick={onDelete}><Trash2 size={15} /></button>}</div>
  </article>
}

