import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export default function PwaUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const activateUpdate = useRef<ReturnType<typeof registerSW> | null>(null)

  useEffect(() => {
    if ('cordova' in window || !('serviceWorker' in navigator)) return

    let timer: number | undefined
    let checkForUpdate: (() => void) | undefined

    activateUpdate.current = registerSW({
      immediate: true,
      onNeedReload: () => setUpdateAvailable(true),
      onRegisteredSW: (_url, registration) => {
        if (!registration) return
        // Look for a new deploy every 30 minutes and whenever the app comes
        // back to the foreground, so fans get changes on the same link.
        checkForUpdate = () => {
          if (navigator.onLine) void registration.update().catch(() => undefined)
        }
        timer = window.setInterval(checkForUpdate, 30 * 60 * 1000)
        document.addEventListener('visibilitychange', onVisible)
      },
    })

    function onVisible() {
      if (document.visibilityState === 'visible') checkForUpdate?.()
    }

    return () => {
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <button className="pwa-update-toast" type="button" onClick={() => void activateUpdate.current?.(true)}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>New version available - tap to refresh</span>
    </button>
  )
}