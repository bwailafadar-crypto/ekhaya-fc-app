import { FirebaseError } from 'firebase/app'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/UI'
import { useAuth } from '../../auth/AuthContext'
import { isAndroidApp } from '../../utils/appShell'

function getErrorMessage(error: unknown) {
  if (error instanceof TypeError) return 'Connection failed. Check your internet and try again.'
  if (!(error instanceof FirebaseError)) return 'Something went wrong. Please try again.'
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
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
  if (isAndroidApp()) return null
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
  return (
    <Button type="submit" disabled={busy} aria-busy={busy}>
      {busy && <LoaderCircle className="button-spinner" size={17} aria-hidden="true" />}
      {busy ? busyLabel : idleLabel}
    </Button>
  )
}

function AuthShell({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: ReactNode
}) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="auth-loading"><div className="skeleton" /></div>
  if (user) {
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

export function LoginPage() {
  const { signIn, accountBlocked } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/') ? from : '/', { replace: true })
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Welcome back" intro="Sign in to follow the club and connect with Ekhaya supporters.">
      {accountBlocked && <p className="auth-error" role="alert">This account has been blocked by the club. Contact Ekhaya FC if you think this is a mistake.</p>}
      <GoogleSignIn onError={setError} />
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">Email address</label>
          <input id="login-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <PasswordField id="login-password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <SubmitButton busy={submitting} idleLabel="Sign in" busyLabel="Signing in..." />
      </form>
      <div className="auth-links">
        <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
        <span>New to Ekhaya? <Link className="auth-link" to="/signup">Create account</Link></span>
        <Link className="auth-link auth-install-link" to="/install">Install the app</Link>
      </div>
    </AuthShell>
  )
}

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Those passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await signUp({ fullName, phone, email, password })
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
          <label htmlFor="signup-email">Email address</label>
          <input id="signup-email" className="auth-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <PasswordField id="signup-password" label="Password" autoComplete="new-password" minLength={6} value={password} onChange={setPassword} />
        <PasswordField id="signup-confirm" label="Confirm password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={setConfirmPassword} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <SubmitButton busy={submitting} idleLabel="Create fan account" busyLabel="Creating account..." />
      </form>
      <div className="auth-links"><span>Already have an account? <Link className="auth-link" to="/login">Sign in</Link></span></div>
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