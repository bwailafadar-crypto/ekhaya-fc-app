// When the "appLocked" switch is on, fans see a "free trial ended" screen
// instead of the app. Admins and the superadmin keep full access, and the
// staff sign-in page stays open so they can get in.
import type { ReactNode } from 'react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { flagValue, getFlags, subscribeFlags } from '../data/flags'

// Payment deadline: 18:47 on 29 October 2026, Malawi time (UTC+2). Once this
// moment passes the notice switches to the red "payment overdue" state on its
// own. Change this one line to move the deadline.
const DEADLINE = Date.parse('2026-10-29T18:47:00+02:00')

const KEY = 'ekhaya-app-locked'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ } }

export default function AppLock({ children }: { children: ReactNode }) {
  const flags = useSyncExternalStore(subscribeFlags, getFlags)
  const { role, user, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  // Until the switches arrive, use the last known state so the app doesn't flash open.
  const locked = flags.loaded ? flagValue(flags, 'appLocked') : remembered()
  if (flags.loaded) remember(locked)
  // When the app is locked, only the superadmin keeps access. Everyone else
  // (fans and ordinary admins) sees the notice. The sign-in pages stay open.
  if (!locked || role === 'superadmin' || pathname === '/login' || pathname === '/forgot-password') return <>{children}</>
  if (user && loading) return null

  const today = new Date()
  const ref = `AP-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const dated = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const overdue = now >= DEADLINE
  const hoursLeft = Math.max(1, Math.ceil((DEADLINE - now) / 3_600_000))

  return <main className="app-lock" role="alert">
    <div className={`app-lock-card${overdue ? ' app-lock-overdue' : ''}`}>
      <header className="app-lock-head">
        <img className="app-lock-logo" src="./appnest-logo.svg" alt="Appnest" width={150} height={46} onError={(e) => { e.currentTarget.style.display = 'none' }} />
        {overdue
          ? <span className="app-lock-pill over"><i className="app-lock-dot" />Payment overdue</span>
          : <span className="app-lock-pill"><i className="app-lock-dot" />Access paused</span>}
      </header>

      <div className="app-lock-body">
        {overdue ? <>
          <h1>Access suspended</h1>
          <p>The free trial has ended and the payment deadline has passed. Access remains suspended.</p>

          <div className="app-lock-panel over">
            <h2><span className="app-lock-warn" aria-hidden="true">⚠️</span> Payment overdue</h2>
            <p>Please complete the subscription payment to restore the app and publish it on Google Play and the Apple App Store.</p>
          </div>

          <p className="app-lock-note">Access is restored automatically once payment is confirmed. No data is lost.</p>
        </> : <>
          <h1>Your free trial has ended</h1>
          <p>Access has been paused while the account is on hold.</p>

          <div className="app-lock-panel">
            <h2>Action required</h2>
            <p>Complete the subscription payment within <strong>{hoursLeft} {hoursLeft === 1 ? 'hour' : 'hours'}</strong> to restore the app and publish it on Google Play and the Apple App Store.</p>
          </div>

          <p className="app-lock-note">Access is restored automatically once payment is confirmed. No data is lost.</p>
        </>}

        <dl className="app-lock-meta">
          <div><dt>Reference</dt><dd>{ref}</dd></div>
          <div><dt>Issued</dt><dd>{dated}</dd></div>
          <div><dt>Status</dt><dd>{overdue ? 'Payment overdue' : 'Awaiting payment'}</dd></div>
        </dl>

        <div className="app-lock-actions">
          {user ? <button type="button" className="app-lock-link" onClick={() => void signOut()}>Sign out</button> : <Link className="app-lock-link" to="/login">Account holder sign in</Link>}
        </div>
      </div>

      <footer className="app-lock-foot">
        <img src="./appnest-icon.svg" alt="" width={20} height={20} aria-hidden="true" />
        <span>Appnest — app hosting &amp; publishing service</span>
      </footer>
    </div>
  </main>
}
