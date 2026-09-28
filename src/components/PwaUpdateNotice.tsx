import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export default function PwaUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if ('cordova' in window || !('serviceWorker' in navigator)) return

    registerSW({
      immediate: true,
      onNeedReload: () => setUpdateAvailable(true),
    })
  }, [])

  if (!updateAvailable) return null

  return (
    <button className="pwa-update-toast" type="button" onClick={() => window.location.reload()}>
      <RefreshCw size={15} aria-hidden="true" />
      <span>New version available - tap to refresh</span>
    </button>
  )
}