// A short opening animation shown once when the app starts: the Ekhaya FC crest
// flies in from far away, lands and holds for a moment, then fades out to reveal
// the page underneath (the sign-in page for signed-out fans).
import { useEffect, useState } from 'react'

const KEY = 'ekhaya-splash-shown'

export default function SplashIntro() {
  // Show once per session (a fresh open plays it; moving between pages does not).
  const [show, setShow] = useState(() => {
    try { return sessionStorage.getItem(KEY) !== '1' } catch { return true }
  })
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!show) return
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ }
    const hold = setTimeout(() => setLeaving(true), 1900) // logo in + hold, then fade
    const done = setTimeout(() => setShow(false), 2600)
    return () => { clearTimeout(hold); clearTimeout(done) }
  }, [show])

  if (!show) return null

  return (
    <div className={`splash${leaving ? ' splash-leaving' : ''}`} role="presentation" aria-hidden="true">
      <div className="splash-glow" />
      <img className="splash-logo" src="./team-logos/ekhaya-fc.png" alt="" width={200} height={200} />
      <span className="splash-word">EKHAYA FC</span>
      <span className="splash-tag">Together, we are home</span>
    </div>
  )
}
