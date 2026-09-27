import { LogOut, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button } from './UI'

export default function LogoutButton() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setError('Could not sign out. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="logout-control">
      <Button type="button" variant="secondary" className="logout-button" onClick={handleSignOut} disabled={busy} aria-busy={busy}>
        {busy ? <LoaderCircle className="button-spinner" size={17} aria-hidden="true" /> : <LogOut size={17} aria-hidden="true" />}
        {busy ? 'Signing out...' : 'Log out'}
      </Button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  )
}