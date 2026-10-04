import { BellRing, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { autoAlerts, enablePush, postponeAlertsPrompt, savedPrefs } from '../utils/push'
import { useToast } from './ToastContext'

/**
 * Makes sure every fan gets match alerts: switches them on silently when the
 * phone already allows it, otherwise shows a one-tap card after sign-in.
 */
export default function AlertsPrompt() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const uid = user?.uid

  useEffect(() => {
    if (!uid) return
    let active = true
    // Give the home page a moment to load first.
    const timer = window.setTimeout(() => {
      void autoAlerts(uid).then((result) => { if (active && result === 'ask') setShow(true) })
    }, 2500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [uid])

  if (!show || !uid) return null

  const later = () => { postponeAlertsPrompt(); setShow(false) }
  const turnOn = async () => {
    setBusy(true)
    try {
      await enablePush(uid, savedPrefs())
      showToast('Alerts are on. You will hear about every Ekhaya goal!', 'success')
      setShow(false)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'blocked') showToast('Alerts are blocked. You can allow them later in your browser settings.', 'error')
      else if (code !== 'dismissed') showToast('Alerts could not be turned on. Try again from your Profile.', 'error')
      postponeAlertsPrompt()
      setShow(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="alerts-prompt" role="dialog" aria-labelledby="alerts-prompt-title">
      <button className="alerts-prompt-close" type="button" aria-label="Not now" onClick={later}><X size={16} /></button>
      <span className="alerts-prompt-icon" aria-hidden="true"><BellRing size={22} /></span>
      <div className="alerts-prompt-copy">
        <strong id="alerts-prompt-title">Never miss a goal</strong>
        <span>Get kick-off, goals and full-time alerts from Ekhaya FC.</span>
      </div>
      <div className="alerts-prompt-actions">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Turning on…' : 'Turn on alerts'}</button>
        <button className="button button-ghost" type="button" disabled={busy} onClick={later}>Not now</button>
      </div>
    </div>
  )
}
