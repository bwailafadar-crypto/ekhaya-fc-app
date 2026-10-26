// The "Confirm it's you" box (password, or the Google account) used by
// confirmIdentity() before dangerous admin actions.
import { browserPopupRedirectResolver, EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '../firebase'
import { registerReauth } from '../utils/reauth'
import { Button } from './UI'

export default function ReauthHost() {
  const [reason, setReason] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const done = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    registerReauth((why) => new Promise<boolean>((resolve) => { done.current = resolve; setPassword(''); setError(''); setReason(why) }))
    return () => registerReauth(null)
  }, [])

  const user = auth.currentUser
  const usesPassword = Boolean(user?.providerData.some((p) => p.providerId === 'password'))
  const usesGoogle = Boolean(user?.providerData.some((p) => p.providerId === 'google.com'))
  const finish = (ok: boolean) => { done.current?.(ok); done.current = null; setReason(null) }

  async function withPassword(event: FormEvent) {
    event.preventDefault()
    if (!user?.email || !password) return
    setBusy(true); setError('')
    try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)); finish(true) }
    catch { setError('That password is not right. Try again.') }
    finally { setBusy(false) }
  }
  async function withGoogle() {
    if (!user) return
    setBusy(true); setError('')
    try { await reauthenticateWithPopup(user, new GoogleAuthProvider(), browserPopupRedirectResolver); finish(true) }
    catch { setError('Google sign-in did not finish. Try again.') }
    finally { setBusy(false) }
  }

  if (reason === null) return null
  return createPortal(<div className="reauth-wrap" role="dialog" aria-modal="true" aria-label="Confirm it's you">
    <form className="reauth" onSubmit={(event) => void withPassword(event)}>
      <span className="reauth-icon" aria-hidden="true"><ShieldCheck size={26} /></span>
      <h2>Confirm it's you</h2>
      <p>{reason}</p>
      {usesPassword && <label className="admin-field"><span>Your password</span><input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      {error && <p className="reauth-error">{error}</p>}
      <div className="reauth-actions">
        {usesPassword && <Button type="submit" disabled={busy || !password}>{busy ? 'Checking…' : 'Confirm'}</Button>}
        {usesGoogle && <Button type="button" variant={usesPassword ? 'secondary' : 'primary'} disabled={busy} onClick={() => void withGoogle()}>Confirm with Google</Button>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => finish(false)}>Cancel</Button>
      </div>
    </form>
  </div>, document.body)
}
