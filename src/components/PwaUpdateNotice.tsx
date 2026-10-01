import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export default function PwaUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const activateUpdate = useRef<ReturnType<typeof registerSW> | null>(null)

  useEffect(() => {
    if ('cordova' in window || !('serviceWorker' in navigator)) return

    activateUpdate.current = registerSW({
      immediate: true,
      onNeedReload: () => setUpdateAvailable(true),
    })
  }, [])

  if (!updateAvailable) return null

  return (
    <button className="pwa-update-toast" type="button" onClick={() => void activateUpdate.current?.(true)}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>New version available - tap to refresh</span>
    </button>
  )
}