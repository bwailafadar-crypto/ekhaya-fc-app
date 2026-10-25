// Profile → "Change password". Email accounts type their current password and
// a new one. Google-only accounts can add a password, so they can also sign in
// with email. Forgot the current one? A reset link is emailed.
import { EmailAuthProvider, GoogleAuthProvider, linkWithCredential, reauthenticateWithCredential, reauthenticateWithPopup, sendPasswordResetEmail, updatePassword } from 'firebase/auth'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { auth } from '../firebase'
import { useToast } from './ToastContext'
import { Button, Card } from './UI'

function Field({ label, value, onChange, autoComplete, show }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; show: boolean }) {
  return <label className="admin-field"><span>{label}</span><input type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} minLength={6} required onChange={(event) => onChange(event.target.value)} /></label>
}

export default function ChangePassword() {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const user = auth.currentUser
  if (!user?.email) return null
  const hasPassword = user.providerData.some((item) => item.providerId === 'password')

  function reset() { setOpen(false); setCurrent(''); setNext(''); setConfirm(''); setError(''); setShow(false) }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const account = auth.currentUser
    if (!account?.email) return
    if (next.length < 6) { setError('Choose a new password with at least 6 characters.'); return }
    if (next !== confirm) { setError('The two new passwords are not the same.'); return }
    if (hasPassword && next === current) { setError('The new password must be different from the current one.'); return }
    setBusy(true); setError('')
    try {
      if (hasPassword) {
        // Firebase needs proof it is really you before changing the password.
        await reauthenticateWithCredential(account, EmailAuthProvider.credential(account.email, current))
        await updatePassword(account, next)
        showToast('Password changed. Use the new one next time you sign in.')
      } else {
        await reauthenticateWithPopup(account, new GoogleAuthProvider())
        await linkWithCredential(account, EmailAuthProvider.credential(account.email, next))
        showToast('Password added. You can now sign in with Google or with your email and this password.')
      }
      reset()
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''
      setError(code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Your current password is not right. Try again, or use "Forgot it?" below.'
        : code === 'auth/weak-password' ? 'Choose a stronger password (at least 6 characters).'
          : code === 'auth/too-many-requests' ? 'Too many tries. Wait a few minutes and try again.'
            : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? 'Confirm with Google to add a password.'
              : code === 'auth/requires-recent-login' ? 'Please sign out, sign in again, then change your password.'
                : 'The password was not changed. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  async function sendReset() {
    if (!user?.email) return
    try { await sendPasswordResetEmail(auth, user.email); showToast(`A link to set a new password was sent to ${user.email}. Check Spam too.`) }
    catch { showToast('The email was not sent. Try again in a minute.', 'error') }
  }

  return <Card className="change-password">
    {!open ? <button type="button" className="change-password-open" onClick={() => setOpen(true)}><KeyRound size={16} aria-hidden="true" /> {hasPassword ? 'Change password' : 'Add a password'}</button>
      : <form className="admin-form" onSubmit={(event) => void save(event)}>
        <h2>{hasPassword ? 'Change password' : 'Add a password'}</h2>
        {!hasPassword && <p className="live-help">You sign in with Google. Add a password to also sign in with {user.email} and a password.</p>}
        {hasPassword && <Field label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" show={show} />}
        <Field label="New password" value={next} onChange={setNext} autoComplete="new-password" show={show} />
        <Field label="Type the new password again" value={confirm} onChange={setConfirm} autoComplete="new-password" show={show} />
        <button type="button" className="change-password-show" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />} {show ? 'Hide passwords' : 'Show passwords'}</button>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="admin-actions">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={reset}>Cancel</Button>
        </div>
        {hasPassword && <button type="button" className="change-password-forgot" onClick={() => void sendReset()}>Forgot it? Email me a link to set a new password</button>}
      </form>}
  </Card>
}
