import { FirebaseError } from 'firebase/app'
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, Send, ShieldCheck, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/UI'
import { useAuth } from '../../auth/AuthContext'
import { isAndroidApp } from '../../utils/appShell'
import { useFlag } from '../../hooks/useFlag'
import { BRANCHES, saveBranch } from '../../utils/community'
import { clearSignOutReport, readSignOutReport } from '../../utils/authDiagnostics'
import { auth } from '../../firebase'


function getErrorMessage(error: unknown) {
  if (error instanceof TypeError) return 'Connection failed. Check your internet and try again.'
  if (!(error instanceof FirebaseError)) return 'Something went wrong. Please try again.'
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/invalid-credential': 'The email or password is incorrect. Check for typos, or use the options below.',
    'auth/wrong-password': 'The email or password is incorrect. Check for typos, or use the options below.',
    'auth/user-not-found': 'The email or password is incorrect. Check for typos, or use the options below.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/network-request-failed': 'Connection failed. Check your internet and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little and try again.',
    'auth/operation-not-allowed': 'Google sign-in is not switched on yet. Please use email for now.',
    'auth/unauthorized-domain': 'Google sign-in is not allowed on this web address yet. Please use email for now.',
    'auth/account-exists-with-different-credential': 'This email already has an account. Sign in with your email and password.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups and try again.',
    'permission-denied': 'Your account was created, but the Firestore rules blocked profile setup. Deploy firestore.rules, then try again.',
  }
  return `${messages[error.code] ?? 'Something went wrong. Please try again.'} (${error.code})`
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  minLength,
}: {
  id: string
  label: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input
          id={id}
          className="auth-input"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="password-visibility"
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

// Google does not allow its sign-in page inside app WebViews, so the APK
// keeps email sign-in only; the website and installed web app get Google.
function GoogleSignIn({ onError }: { onError: (message: string) => void }) {
  const { signInWithGoogle, googleError } = useAuth()
  const [busy, setBusy] = useState(false)
  // Switched on from Admin → App health ("Continue with Google").
  const enabled = useFlag('googleSignIn')
  if (!enabled || isAndroidApp()) return null
  const redirectMessage = googleError && !(googleError instanceof FirebaseError && googleError.code === 'auth/redirect-cancelled-by-user') ? getErrorMessage(googleError) : ''

  async function handleClick() {
    onError('')
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (reason) {
      const code = reason instanceof FirebaseError ? reason.code : ''
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') onError(getErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {redirectMessage && <p className="auth-error" role="alert">{redirectMessage}</p>}
      <button className="google-signin" type="button" onClick={() => void handleClick()} disabled={busy} aria-busy={busy}>
        {busy ? <LoaderCircle className="button-spinner" size={18} aria-hidden="true" /> : <GoogleMark />}
        {busy ? 'Opening Google...' : 'Continue with Google'}
      </button>
      <div className="auth-divider"><span>or use email</span></div>
    </>
  )
}

function SubmitButton({ busy, idleLabel, busyLabel }: { busy: boolean; idleLabel: string; busyLabel: string }) {
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null)
  return (
    <Button
      type="submit"
      className={`auth-submit${busy ? ' is-busy' : ''}`}
      disabled={busy}
      aria-busy={busy}
      onPointerDown={(event) => {
        // Gold ripple from where the button was pressed.
        const box = event.currentTarget.getBoundingClientRect()
        setRipple({ x: event.clientX - box.left, y: event.clientY - box.top, key: Date.now() })
      }}
    >
      {ripple && <span key={ripple.key} className="auth-ripple" style={{ left: ripple.x, top: ripple.y }} aria-hidden="true" onAnimationEnd={() => setRipple(null)} />}
      <span className="auth-submit-label">
        {busy && <LoaderCircle className="button-spinner" size={17} aria-hidden="true" />}
        {busy ? busyLabel : idleLabel}
      </span>
    </Button>
  )
}

type SendStatus = 'idle' | 'sending' | 'crash' | 'success' | 'error'

/** True when this phone can draw the free-flying plane (and the fan has not asked for less motion). */
function canFly() {
  try {
    return typeof window !== 'undefined'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      && CSS.supports('offset-path', 'path("M 0 0 L 1 1")')
      && typeof Element.prototype.animate === 'function'
  } catch {
    return false
  }
}

const HOLD_MS = 1500

/** A paper plane that leaves the button and flies over the screen along real curved paths. */
function PlaneFlight({ status, from }: { status: SendStatus; from: RefObject<HTMLElement | null> }) {
  const planeRef = useRef<HTMLDivElement | null>(null)
  const trailRef = useRef<SVGPathElement | null>(null)
  const maskRef = useRef<SVGPathElement | null>(null)
  const geo = useRef({ cx: 0, cy: 0, r: 44, w: 0, bx: 0, by: 0 })
  const hold = useRef<Animation | null>(null)
  const running = useRef<Animation[]>([])
  const run = useRef(0)

  // The sky layer is added straight to the page (outside React) so it can fly over everything.
  useLayoutEffect(() => {
    const layer = document.createElement('div')
    layer.className = 'flight-layer'
    layer.setAttribute('aria-hidden', 'true')
    layer.innerHTML = `<svg class="flight-sky"><defs><mask id="flight-trail-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><path fill="none" stroke="#fff" stroke-width="10" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></mask></defs><path class="flight-trail" mask="url(#flight-trail-mask)"/></svg><div class="flight-plane"><svg viewBox="0 0 32 32"><path d="M3 5 L30 16 L3 27 L9 16 Z" fill="#E8C55A"/><path d="M9 16 L30 16 L12 23 Z" fill="#B8902A"/><path d="M3 5 L30 16 L3 27 L9 16 Z M9 16 L30 16" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`
    document.body.appendChild(layer)
    planeRef.current = layer.querySelector<HTMLDivElement>('.flight-plane')
    trailRef.current = layer.querySelector<SVGPathElement>('.flight-trail')
    maskRef.current = layer.querySelector<SVGPathElement>('mask path')
    return () => {
      running.current.forEach((a) => a.cancel())
      running.current = []
      layer.remove()
    }
  }, [])

  useLayoutEffect(() => {
    const plane = planeRef.current
    const trail = trailRef.current
    const mask = maskRef.current
    const anchor = from.current
    if (!plane || !trail || !mask || !anchor) return
    const token = ++run.current
    const g = geo.current

    const track = (a: Animation) => { running.current.push(a); return a }
    const stop = () => { running.current.forEach((a) => a.cancel()); running.current = []; hold.current = null }

    const fly = (d: string, duration: number, easing: string, frames: Keyframe[], withTrail: boolean) => {
      plane.style.setProperty('offset-path', `path("${d}")`)
      const a = track(plane.animate(frames, { duration, easing, fill: 'forwards' }))
      if (withTrail) {
        trail.setAttribute('d', d)
        mask.setAttribute('d', d)
        track(mask.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, easing, fill: 'forwards' }))
        track(trail.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: duration + 700, fill: 'forwards' }))
      }
      return a
    }

    // Where the plane is now, and which way it is heading.
    const here = () => {
      const box = plane.getBoundingClientRect()
      const p = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      const h = hold.current
      if (!h) return { p: { x: g.cx + g.r, y: g.cy }, t: { x: 0, y: -1 } }
      const f = ((Number(h.currentTime) || 0) % HOLD_MS) / HOLD_MS
      const a = f * Math.PI * 2
      return { p, t: { x: -Math.sin(a), y: -Math.cos(a) } }
    }

    if (status === 'sending') {
      stop()
      const icon = anchor.getBoundingClientRect()
      const button = anchor.closest('button')?.getBoundingClientRect() ?? icon
      const x0 = icon.left + icon.width / 2
      const y0 = icon.top + icon.height / 2
      g.w = window.innerWidth
      g.r = 44
      g.cx = Math.min(Math.max(g.w / 2, g.r + 24), g.w - g.r - 24)
      g.cy = Math.max(g.r + 30, y0 - 200)
      g.bx = button.left + button.width / 2
      g.by = button.top + 4
      // Take off: a short roll along the button, then climb into a holding circle.
      const takeoff = `M ${x0} ${y0} C ${x0 + 60} ${y0 - 4}, ${g.cx + g.r + 20} ${g.cy + 110}, ${g.cx + g.r} ${g.cy}`
      const climb = fly(takeoff, 750, 'cubic-bezier(.45,0,.25,1)', [
        { offsetDistance: '0%', opacity: 1, transform: 'scale(.75)' },
        { offsetDistance: '100%', opacity: 1, transform: 'scale(1.15)' },
      ], true)
      climb.finished.then(() => {
        if (run.current !== token) return
        const { cx, cy, r } = g
        // Circle the sky while we wait for the answer.
        plane.style.setProperty('offset-path', `path("M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy}")`)
        hold.current = track(plane.animate([
          { offsetDistance: '0%', opacity: 1, transform: 'scale(1.15)' },
          { offsetDistance: '100%', opacity: 1, transform: 'scale(1.15)' },
        ], { duration: HOLD_MS, iterations: Infinity }))
      }).catch(() => undefined)
      return
    }

    if (status === 'success') {
      const { p, t } = here()
      stop()
      // Bank away and shoot off the top-right of the screen, getting smaller in the distance.
      const away = `M ${p.x} ${p.y} C ${p.x + t.x * 80} ${p.y + t.y * 80}, ${g.w * 0.7} ${p.y + 40}, ${g.w + 70} ${-70}`
      fly(away, 900, 'cubic-bezier(.55,0,.9,.55)', [
        { offsetDistance: '0%', opacity: 1, transform: 'scale(1.15)' },
        { offsetDistance: '100%', opacity: 0.9, transform: 'scale(.45)' },
      ], true)
      return
    }

    if (status === 'crash') {
      const { p, t } = here()
      stop()
      // Engine trouble: wobble, then nose-dive into the button.
      const dive = `M ${p.x} ${p.y} C ${p.x + t.x * 60} ${p.y + t.y * 60}, ${g.bx + 80} ${g.by - 150}, ${g.bx} ${g.by}`
      fly(dive, 650, 'cubic-bezier(.6,0,1,.6)', [
        { offsetDistance: '0%', opacity: 1, transform: 'scale(1.15) rotate(0deg)' },
        { offsetDistance: '45%', opacity: 1, transform: 'scale(1.05) rotate(-18deg)', offset: 0.4 },
        { offsetDistance: '100%', opacity: 1, transform: 'scale(.9) rotate(25deg)', offset: 0.9 },
        { offsetDistance: '100%', opacity: 0, transform: 'scale(.3) rotate(60deg)' },
      ], true)
      return
    }

    stop()
  }, [status, from])

  return null
}

/**
 * Telegram-style send button. On phones that support it the plane takes off,
 * circles while signing in, then either flies away (green) or crashes (red).
 */
function SendButton({ status, label }: { status: SendStatus; label: string }) {
  const [flying] = useState(canFly)
  const iconRef = useRef<HTMLSpanElement>(null)
  const text = status === 'sending' || status === 'crash' ? 'Signing in…' : status === 'success' ? 'Welcome!' : status === 'error' ? 'Try again' : label
  const planeAway = flying && (status === 'sending' || status === 'crash')
  return (
    <button
      type="submit"
      className={`button button-primary auth-submit auth-send is-${status}${flying ? ' is-flying' : ''}`}
      disabled={status === 'sending' || status === 'crash' || status === 'success'}
      aria-busy={status === 'sending' || status === 'crash'}
    >
      <span className="auth-submit-label">
        <span className="auth-send-icon" aria-hidden="true" ref={iconRef}>
          {status === 'success' ? <>{!flying && <Send className="auth-plane auth-plane-away" size={18} />}<Check className="auth-send-check" size={19} strokeWidth={3} /></>
            : status === 'error' ? <X className="auth-send-check" size={19} strokeWidth={3} />
            : planeAway ? <span className="auth-runway" />
            : <Send className="auth-plane" size={18} />}
        </span>
        <span aria-live="polite">{text}</span>
      </span>
      {flying && <PlaneFlight status={status} from={iconRef} />}
    </button>
  )
}

function AuthShell({
  title,
  intro,
  children,
  holdRedirect = false,
}: {
  title: string
  intro: string
  children: ReactNode
  /** Keep this page on screen (e.g. to finish the sign-in animation). */
  holdRedirect?: boolean
}) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading && !holdRedirect) return <div className="auth-loading"><div className="skeleton" /></div>
  if (user && !holdRedirect) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from?.startsWith('/') ? from : '/'} replace />
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <img className="club-crest" src="./team-logos/ekhaya-fc.png" alt="Ekhaya FC crest" />
        <span className="auth-brand-copy">
          <span className="auth-brand-title">EKHAYA FC</span>
          <span className="auth-brand-caption">Together, we are home.</span>
        </span>
      </div>
      <section className="auth-card" aria-labelledby="auth-heading">
        <img className="auth-crest" src="./team-logos/ekhaya-fc.png" alt="Ekhaya FC crest" />
        <span className="page-eyebrow">Official supporters app</span>
        <h1 id="auth-heading">{title}</h1>
        <p className="auth-intro">{intro}</p>
        {children}
      </section>
      <p className="auth-note"><ShieldCheck size={12} aria-hidden="true" /> Your account is protected by Ekhaya FC</p>
    </main>
  )
}

/** Shown when the app signed someone out by itself, with details to send to the club. */
function SignOutNotice() {
  const [report, setReport] = useState(readSignOutReport)
  const [copied, setCopied] = useState(false)
  if (!report) return null
  const details = [`Signed out at ${report.at} on ${report.path || '/'} (${report.online ? 'online' : 'offline'})`, report.agent, ...report.events].join('\n')
  return (
    <div className="signout-notice" role="alert">
      <strong>You were signed out unexpectedly</strong>
      <span>Sign in again. If it keeps happening, tap Copy details and send them to the club.</span>
      <pre>{report.events.slice(-4).join('\n') || 'No error was recorded.'}</pre>
      <div>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(details).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Copied ✓' : 'Copy details'}</button>
        <button type="button" onClick={() => { clearSignOutReport(); setReport(null) }}>Dismiss</button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { signIn, accountBlocked, sendPasswordReset } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  // After a rejected email/password: one-tap ways back in.
  const [stuck, setStuck] = useState(false)
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function emailResetLink() {
    setResetState('sending')
    try { await sendPasswordReset(email); setResetState('sent') } catch { setResetState('failed') }
  }
  const [status, setStatus] = useState<SendStatus>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('sending')
    try {
      await signIn(email, password)
      // Green "Welcome!" while the plane flies off, then into the app.
      setStatus('success')
      const from = (location.state as { from?: string } | null)?.from
      window.setTimeout(() => navigate(from?.startsWith('/') ? from : '/', { replace: true }), 1100)
    } catch (reason) {
      const message = getErrorMessage(reason)
      const code = reason instanceof FirebaseError ? reason.code : ''
      setStuck(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/too-many-requests'].includes(code))
      setResetState('idle')
      // Let the plane crash into the button first, then show red.
      const crashMs = canFly() ? 650 : 0
      setStatus('crash')
      window.setTimeout(() => {
        setError(message)
        setStatus('error')
        window.setTimeout(() => setStatus((current) => (current === 'error' ? 'idle' : current)), 1800)
      }, crashMs)
    }
  }

  return (
    <AuthShell title="Welcome back" intro="Sign in to follow the club and connect with Ekhaya supporters." holdRedirect={status === 'sending' || status === 'crash' || status === 'success'}>
      <SignOutNotice />
      {accountBlocked && <p className="auth-error" role="alert">This account has been blocked by the club. Contact Ekhaya FC if you think this is a mistake.</p>}
      <GoogleSignIn onError={setError} />
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <PasswordField id="login-password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <SendButton status={status} label="Sign in" />
      </form>
      {stuck && email.includes('@') && <div className="auth-help" role="region" aria-label="Help signing in">
        <strong>Can't get in?</strong>
        <button type="button" className="auth-help-action" disabled={resetState === 'sending' || resetState === 'sent'} onClick={() => void emailResetLink()}>
          {resetState === 'sent' ? `✔ Link sent to ${email.trim()} — check your inbox and spam` : resetState === 'sending' ? 'Sending…' : '📧 Email me a link to set a new password'}
        </button>
        {resetState === 'failed' && <small>The link could not be sent. Check the email address and your connection.</small>}
        <Link className="auth-help-action" to="/signup" state={{ email: email.trim() }}>🆕 I don't have an app account yet: create one with this email</Link>
        <small>Club members from before the app also need to create an account once. Their membership links automatically.</small>
      </div>}
      <div className="auth-links">
        <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
        <span>New to Ekhaya? <Link className="auth-link" to="/signup">Create account</Link></span>
        <Link className="auth-link auth-install-link" to="/install">Install the app</Link>
        <a className="auth-link" href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>
      </div>
    </AuthShell>
  )
}

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const signUpLocation = useLocation()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  // Coming from "Can't get in?" on the sign-in page: keep the email they typed.
  const [email, setEmail] = useState(() => String((signUpLocation.state as { email?: string } | null)?.email ?? ''))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [branch, setBranch] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Those passwords do not match.')
      return
    }
    if (/(ekhaya|official|admin|club|management)/i.test(fullName)) {
      setError('Please use your own name. Names that look like the club or its staff are not allowed.')
      return
    }
    setSubmitting(true)
    try {
      await signUp({ fullName, phone, email, password })
      const newUid = auth.currentUser?.uid
      // Joining a branch is a bonus: never block sign-up if it fails.
      if (branch && newUid) await saveBranch(newUid, fullName.trim().slice(0, 120), branch).catch(() => undefined)
      navigate('/', { replace: true })
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Join the family" intro="Create your fan account. New accounts always start with fan access.">
      <GoogleSignIn onError={setError} />
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="signup-name">Full name</label>
          <input id="signup-name" className="auth-input" autoComplete="name" maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </div>
        <div className="auth-field">
          <label htmlFor="signup-phone">Phone number <span>(optional)</span></label>
          <input id="signup-phone" className="auth-input" type="tel" autoComplete="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div className="auth-field">
          <label htmlFor="signup-branch">Your district <span>(optional)</span></label>
          <select id="signup-branch" className="auth-input" value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option value="">Choose your fan branch…</option>
            {BRANCHES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="auth-field">
          <label htmlFor="signup-email">Email address</label>
          <input id="signup-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <PasswordField id="signup-password" label="Password" autoComplete="new-password" minLength={6} value={password} onChange={setPassword} />
        <PasswordField id="signup-confirm" label="Confirm password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={setConfirmPassword} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <SubmitButton busy={submitting} idleLabel="Create fan account" busyLabel="Creating account..." />
      </form>
      <div className="auth-links"><span>Already have an account? <Link className="auth-link" to="/login">Sign in</Link></span></div>
      <p className="auth-legal">By creating an account you agree to how we use your details in our <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      await sendPasswordReset(email)
      setSuccess('If an account uses this email, a password reset link is on its way.')
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Reset your password" intro="Enter your account email and we will send you a reset link.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="reset-email">Email address</label>
          <input id="reset-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {success && <p className="auth-success" role="status">{success}</p>}
        <SubmitButton busy={submitting} idleLabel="Send reset link" busyLabel="Sending..." />
      </form>
      <div className="auth-links"><Link className="auth-link" to="/login"><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</Link></div>
    </AuthShell>
  )
}