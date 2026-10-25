// "Delete my account" (Google Play requires apps to offer this inside the app).
// Removes the fan's profile, fan card and alerts on this device straight away,
// then deletes the sign-in itself. Anything left (old votes, predictions,
// check-ins) is removed by the weekly clean-up from deletionRequests/{uid}.
import { browserPopupRedirectResolver, deleteUser, EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { disablePush } from '../utils/push'
import { Button, Card } from './UI'
import { useToast } from './ToastContext'

export default function DeleteAccount() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const user = auth.currentUser
  const usesPassword = Boolean(user?.providerData.some((item) => item.providerId === 'password'))

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = auth.currentUser
    if (!current || confirmText.trim().toUpperCase() !== 'DELETE') return
    setBusy(true)
    setError('')
    try {
      // Prove it is really the fan (Firebase needs a fresh sign-in to delete).
      if (usesPassword) await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email ?? '', password))
      else await reauthenticateWithPopup(current, new GoogleAuthProvider(), browserPopupRedirectResolver)
      await setDoc(doc(db, 'deletionRequests', current.uid), { email: current.email ?? '', createdAt: serverTimestamp() })
      await disablePush().catch(() => undefined)
      await deleteDoc(doc(db, 'fanCards', current.uid)).catch(() => undefined)
      await deleteDoc(doc(db, 'activity', current.uid)).catch(() => undefined)
      await deleteDoc(doc(db, 'users', current.uid))
      await deleteUser(current)
      showToast('Your account has been deleted.')
      navigate('/login', { replace: true })
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''
      setError(code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'That password is not right. Try again.'
        : code === 'auth/popup-closed-by-user' ? 'Sign in with Google again to confirm.'
          : code === 'auth/too-many-requests' ? 'Too many tries. Wait a few minutes and try again.'
            : 'Your account was not deleted. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  return <Card className="delete-account">
    {!open ? <button type="button" className="delete-account-open" onClick={() => setOpen(true)}><Trash2 size={16} aria-hidden="true" /> Delete my account</button>
      : <form className="admin-form" onSubmit={(event) => void remove(event)}>
        <h2>Delete my account</h2>
        <p>This removes your profile, fan card, alerts and your votes, predictions and check-ins. It cannot be undone. A paid membership record is kept by the club for its accounts.</p>
        {usesPassword && <label className="admin-field"><span>Your password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        <label className="admin-field"><span>Type DELETE to confirm</span><input autoComplete="off" autoCapitalize="characters" required value={confirmText} onChange={(event) => setConfirmText(event.target.value)} /></label>
        {error && <p className="live-error" role="alert">{error}</p>}
        <div className="admin-actions">
          <Button type="submit" variant="danger" disabled={busy || confirmText.trim().toUpperCase() !== 'DELETE'}>{busy ? 'Deleting…' : 'Delete for ever'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setError('') }}>Cancel</Button>
        </div>
      </form>}
  </Card>
}
