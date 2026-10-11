import { ExternalLink, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { parseVideo } from '../utils/video'

/** Plays a YouTube or Facebook video on top of the app. */
export default function VideoPlayer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const video = parseVideo(url)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])
  return createPortal(<div className="video-player" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="video-player-top" onClick={(event) => event.stopPropagation()}>
      <strong>{title}</strong>
      <a href={url} target="_blank" rel="noreferrer" aria-label="Open on the video site"><ExternalLink size={18} /></a>
      <button type="button" aria-label="Close video" onClick={onClose}><X size={22} /></button>
    </div>
    <div className={`video-frame${video?.portrait ? ' portrait' : ''}`} onClick={(event) => event.stopPropagation()}>
      {video ? <iframe src={video.embed} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <p>This link can't be played here. <a href={url} target="_blank" rel="noreferrer">Open it</a></p>}
    </div>
  </div>, document.body)
}
