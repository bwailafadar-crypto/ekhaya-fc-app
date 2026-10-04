import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * Keeps every fan on the latest version without changing the link.
 * The service worker installs a new deploy in the background; once it is
 * active, the page reloads itself when the fan is not looking (app in the
 * background), or shows a bar they can tap to reload straight away.
 */
export default function PwaUpdateNotice() {
  const [updateReady, setUpdateReady] = useState(false)
  const updateReadyRef = useRef(false)

  useEffect(() => {
    if ('cordova' in window || !('serviceWorker' in navigator)) return

    let timer: number | undefined
    let registration: ServiceWorkerRegistration | undefined

    const checkForUpdate = () => {
      if (registration && navigator.onLine) void registration.update().catch(() => undefined)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && updateReadyRef.current) {
        // Swap to the new version while the fan is away from the screen.
        window.location.reload()
        return
      }
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    registerSW({
      immediate: true,
      // Called when a newly deployed version has taken over.
      onNeedReload: () => {
        if (document.visibilityState === 'hidden') {
          window.location.reload()
          return
        }
        updateReadyRef.current = true
        setUpdateReady(true)
      },
      onRegisteredSW: (_url, reg) => {
        if (!reg) return
        registration = reg
        checkForUpdate()
        timer = window.setInterval(checkForUpdate, CHECK_EVERY_MS)
      },
    })

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', checkForUpdate)
    return () => {
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', checkForUpdate)
    }
  }, [])

  if (!updateReady) return null

  return (
    <button className="pwa-update-toast" type="button" onClick={() => window.location.reload()}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>New version ready - tap to update</span>
    </button>
  )
}
