import { ExternalLink, Maximize, Minimize, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const box = useRef<HTMLDivElement>(null)
  // Full screen: the phone's real full screen (and turn sideways) when it allows it,
  // otherwise the player fills the whole screen inside the app.
  const [full, setFull] = useState(false)
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement && !(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) setFull(false) }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync) }
  }, [])
  async function toggleFull() {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    if (full) {
      setFull(false)
      try { orientation.unlock?.() } catch { /* not allowed */ }
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      return
    }
    setFull(true)
    try { await (el?.requestFullscreen ? el.requestFullscreen() : el?.webkitRequestFullscreen?.()) } catch { /* the in-app full screen still works */ }
    if (!video?.portrait) await orientation.lock?.('landscape').catch(() => undefined)
  }
  function close() {
    try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.() } catch { /* not allowed */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    onClose()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])
  return createPortal(<div ref={box} className={`video-player${full ? ' fs' : ''}${video?.portrait ? ' is-portrait' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={close}>
    <div className="video-player-top" onClick={(event) => event.stopPropagation()}>
      <strong>{title}</strong>
      {video?.provider !== 'youtube' && <a href={url} target="_blank" rel="noreferrer" aria-label="Open on the video site"><ExternalLink size={18} /></a>}
      {video && <button type="button" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => void toggleFull()}>{full ? <Minimize size={19} /> : <Maximize size={19} />}</button>}
      <button type="button" aria-label="Close video" onClick={close}><X size={22} /></button>
    </div>
    <div className={`video-frame${video?.portrait ? ' portrait' : ''}`} onClick={(event) => event.stopPropagation()}>
      {video ? <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        : <p>This link can't be played here. <a href={url} target="_blank" rel="noreferrer">Open it</a></p>}
    </div>
  </div>, document.body)
}
