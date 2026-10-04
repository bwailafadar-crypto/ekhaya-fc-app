import { useEffect } from 'react'
import { useToast } from './ToastContext'

/** Shows alerts as an in-app message while the app is open on screen. */
export default function ForegroundAlerts() {
  const { showToast } = useToast()
  useEffect(() => {
    // Only devices that turned alerts on download the messaging code.
    let hasToken = false
    try { hasToken = Boolean(localStorage.getItem('ekhaya-push-token')) } catch { /* storage blocked */ }
    if (!hasToken) return
    let stop: (() => void) | undefined
    let cancelled = false
    void import('../utils/push')
      .then(({ listenForForegroundAlerts }) => listenForForegroundAlerts((title, body) => showToast(body ? `${title} · ${body}` : title, 'info')))
      .then((unsubscribe) => { if (cancelled) unsubscribe(); else stop = unsubscribe })
      .catch(() => undefined)
    return () => { cancelled = true; stop?.() }
  }, [showToast])
  return null
}
