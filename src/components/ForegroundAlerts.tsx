import { useEffect } from 'react'
import { listenForForegroundAlerts } from '../utils/push'
import { useToast } from './ToastContext'

/** Shows alerts as an in-app message while the app is open on screen. */
export default function ForegroundAlerts() {
  const { showToast } = useToast()
  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void listenForForegroundAlerts((title, body) => showToast(body ? `${title} · ${body}` : title, 'info')).then((unsubscribe) => {
      if (cancelled) unsubscribe(); else stop = unsubscribe
    })
    return () => { cancelled = true; stop?.() }
  }, [showToast])
  return null
}
