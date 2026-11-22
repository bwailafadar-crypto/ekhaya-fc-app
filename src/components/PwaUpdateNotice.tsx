import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * Keeps every fan on the latest version without changing the link.
 * With registerType 'prompt' the new deploy installs in the background and
 * waits; we then apply it silently while the fan is away from the screen, or
 * show a bar they can tap to update straight away. updateSW(true) activates the
 * waiting worker and reloads the page onto the new version.
 */
export default function PwaUpdateNotice() {
  const [updateReady, setUpdateReady] = useState(false)
  const updateReadyRef = useRef(false)
  const updateSWRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if ('cordova' in window || !('serviceWorker' in navigator)) return

    let timer: number | undefined
    let registration: ServiceWorkerRegistration | undefined

    const checkForUpdate = () => {
      if (registration && navigator.onLine) void registration.update().catch(() => undefined)
    }

    const applyUpdate = () => { void updateSWRef.current?.(true) }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && updateReadyRef.current) {
        // Swap to the new version while the fan is away from the screen.
        applyUpdate()
        return
      }
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    updateSWRef.current = registerSW({
      immediate: true,
      // A newly deployed version is installed and waiting to take over.
      onNeedRefresh: () => {
        if (document.visibilityState === 'hidden') {
          applyUpdate()
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
    <button className="pwa-update-toast" type="button" onClick={() => void updateSWRef.current?.(true)}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>New version ready - tap to update</span>
    </button>
  )
}
