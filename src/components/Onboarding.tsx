// First-run welcome carousel, shown once after the opening splash to signed-out
// fans (like the big clubs' apps): a few swipeable slides introducing the app,
// ending with Register / Sign in. Uses the Ekhaya crest and club colours only.
// Shows once per install (localStorage), never for someone already signed in.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const DONE_KEY = 'ekhaya-onboarding-done'
const seen = () => { try { return localStorage.getItem(DONE_KEY) === '1' } catch { return false } }
const markSeen = () => { try { localStorage.setItem(DONE_KEY, '1') } catch { /* private mode */ } }

type Slide = { title: string; accent: string; body: string }
const SLIDES: Slide[] = [
  { title: 'WELCOME TO YOUR', accent: 'EKHAYA FC APP', body: 'Latest club news, videos, live scores, the league table and matchday updates — all in one place.' },
  { title: 'FOLLOW THE', accent: 'WHOLE CLUB', body: "Follow your favourite players, watch Ekhaya TV, and keep up with both the men's and women's teams." },
  { title: 'JOIN THE', accent: 'EKHAYA FAMILY', body: 'Register or sign in to manage your membership, shop the club store and get closer to the action.' },
]

export default function Onboarding() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  // Read "already seen" once per mount, then let a dismiss hide it immediately.
  const [wasSeen] = useState(seen)
  const [dismissed, setDismissed] = useState(false)
  const [i, setI] = useState(0)
  const startX = useRef<number | null>(null)

  // Show only to brand-new, signed-out visitors, once auth has resolved.
  const show = !loading && !user && !wasSeen && !dismissed
  if (!show) return null

  const last = i === SLIDES.length - 1
  const finish = (to: string) => { markSeen(); setDismissed(true); navigate(to) }
  const next = () => (last ? finish('/signup') : setI((n) => n + 1))
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)))

  const onDown = (x: number) => { startX.current = x }
  const onUp = (x: number) => {
    if (startX.current === null) return
    const dx = x - startX.current
    startX.current = null
    if (dx < -40) go(i + 1)
    else if (dx > 40) go(i - 1)
  }

  const slide = SLIDES[i]
  return (
    <div
      className="onb"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to the Ekhaya FC app"
      onTouchStart={(e) => onDown(e.touches[0].clientX)}
      onTouchEnd={(e) => onUp(e.changedTouches[0].clientX)}
      onPointerDown={(e) => onDown(e.clientX)}
      onPointerUp={(e) => onUp(e.clientX)}
    >
      <button type="button" className="onb-skip" onClick={() => finish('/login')}>Skip</button>

      <div className="onb-stage" key={i}>
        <div className="onb-glow" />
        <img className="onb-crest" src="./team-logos/ekhaya-fc.png" alt="" width={150} height={150} />
      </div>

      <div className="onb-copy">
        <div className="onb-dots" role="tablist" aria-label="Slides">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              type="button"
              className={`onb-dot${n === i ? ' on' : ''}`}
              aria-label={`Go to slide ${n + 1}`}
              aria-selected={n === i}
              role="tab"
              onClick={() => go(n)}
            />
          ))}
        </div>
        <h1 className="onb-title">{slide.title} <em>{slide.accent}</em></h1>
        <p className="onb-body">{slide.body}</p>

        {last ? (
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={() => finish('/signup')}>Register</button>
            <button type="button" className="onb-btn onb-btn-ghost" onClick={() => finish('/login')}>Sign in</button>
          </div>
        ) : (
          <div className="onb-actions">
            <button type="button" className="onb-btn onb-btn-primary" onClick={next}>Get started</button>
          </div>
        )}
      </div>
    </div>
  )
}
