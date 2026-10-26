import { ExternalLink, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { config } from '../config'
import { parseVideo } from '../utils/video'

// Inside the Android app the page has no web address, and YouTube then refuses
// to play (error 153), so YouTube videos play through the club's own player page.
const inApp = typeof window !== 'undefined' && (window.location.protocol === 'file:' || 'cordova' in window || /EkhayaFCApp\//.test(navigator.userAgent))

/** Plays a YouTube or Facebook video on top of the app. */
export default function VideoPlayer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const video = parseVideo(url)
  const src = video?.provider === 'youtube' && inApp ? `${config.appUrl}yt.html?v=${video.id}` : video?.embed
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
      {video?.provider !== 'youtube' && <a href={url} target="_blank" rel="noreferrer" aria-label="Open on the video site"><ExternalLink size={18} /></a>}
      <button type="button" aria-label="Close video" onClick={onClose}><X size={22} /></button>
    </div>
    <div className={`video-frame${video?.portrait ? ' portrait' : ''}`} onClick={(event) => event.stopPropagation()}>
      {video ? <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <p>This link can't be played here. <a href={url} target="_blank" rel="noreferrer">Open it</a></p>}
    </div>
  </div>, document.body)
}
