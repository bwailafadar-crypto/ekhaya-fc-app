// When the "appLocked" switch is on, fans see a "free trial ended" screen
// instead of the app. Admins and the superadmin keep full access, and the
// staff sign-in page stays open so they can get in.
import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { flagValue, getFlags, subscribeFlags } from '../data/flags'

const KEY = 'ekhaya-app-locked'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ } }

export default function AppLock({ children }: { children: ReactNode }) {
  const flags = useSyncExternalStore(subscribeFlags, getFlags)
  const { role, user, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  // Until the switches arrive, use the last known state so the app doesn't flash open.
  const locked = flags.loaded ? flagValue(flags, 'appLocked') : remembered()
  if (flags.loaded) remember(locked)
  const staff = role === 'admin' || role === 'superadmin'
  if (!locked || staff || pathname === '/login' || pathname === '/forgot-password') return <>{children}</>
  if (user && loading) return null

  const today = new Date()
  const ref = `AP-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const dated = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return <main className="app-lock" role="alert">
    <div className="app-lock-card">
      <header className="app-lock-head">
        <img className="app-lock-logo" src="./appnest-logo.svg" alt="Appnest" width={150} height={46} onError={(e) => { e.currentTarget.style.display = 'none' }} />
        <span className="app-lock-pill"><i className="app-lock-dot" />Access paused</span>
      </header>

      <div className="app-lock-body">
        <h1>Your free trial has ended</h1>
        <p>The 5-week free trial of this mobile app has now ended, and access has been temporarily paused while the account is on hold.</p>

        <div className="app-lock-panel">
          <h2>Action required</h2>
          <p>To restore access and publish the app on Google Play and the Apple App Store, the subscription payment needs to be completed within <strong>16 hours</strong>.</p>
        </div>

        <p className="app-lock-note">Access is restored automatically as soon as the payment is confirmed. No data is lost while the account is on hold.</p>

        <dl className="app-lock-meta">
          <div><dt>Reference</dt><dd>{ref}</dd></div>
          <div><dt>Issued</dt><dd>{dated}</dd></div>
          <div><dt>Status</dt><dd>Awaiting payment</dd></div>
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
