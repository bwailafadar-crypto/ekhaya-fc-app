import { FirebaseError } from 'firebase/app'
import { Check, MailCheck, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function VerificationBanner() {
  const { user, emailVerified, sendVerificationEmail, refreshEmailVerification } = useAuth()
  const currentUser = user
  const [busy, setBusy] = useState<'send' | 'refresh' | null>(null)
  const [message, setMessage] = useState('')

  if (!currentUser || emailVerified) return null

  async function resend() {
    setBusy('send')
    setMessage('')
    try {
      await sendVerificationEmail()
      setMessage('Verification email sent.')
    } catch {
      setMessage('Could not send the email. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  async function checkStatus() {
    setBusy('refresh')
    setMessage('')
    try {
      const verified = await refreshEmailVerification()
      if (!verified) setMessage('Not verified yet. You can keep using the app.')
    } catch (error) {
      const isOffline = error instanceof FirebaseError && error.code === 'auth/network-request-failed'
      setMessage(isOffline ? 'Connection failed. Check your internet and try again.' : 'Could not check yet. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="verification-banner" aria-label="Email verification notice">
      <span className="verification-icon"><MailCheck size={19} aria-hidden="true" /></span>
      <div className="verification-copy">
        <strong>Verify your email</strong>
        <span>We sent a link to {currentUser.email}. You can use the app while you verify.</span>
        {message && <span className="verification-message" role="status">{message}</span>}
      </div>
      <div className="verification-actions">
        <button type="button" className="verification-action" onClick={resend} disabled={busy !== null}>
          <RefreshCw size={14} aria-hidden="true" /> {busy === 'send' ? 'Sending...' : 'Resend'}
        </button>
        <button type="button" className="verification-action" onClick={checkStatus} disabled={busy !== null}>
          <Check size={14} aria-hidden="true" /> {busy === 'refresh' ? 'Checking...' : 'I verified'}
        </button>
      </div>
    </section>
  )
}