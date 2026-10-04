import { onSnapshot } from 'firebase/firestore'
import { SNAPSHOT_REF } from '../data/publicSnapshot'
import { CloudOff, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Tells fans when they are seeing saved information because the connection is
 * down or too weak to reach the club's server. Disappears when it is back.
 */
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const [weak, setWeak] = useState(false)

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    // A tiny live query: if its data keeps coming only from the phone's saved
    // copy for a while, the server is not reachable.
    let timer: number | undefined
    const stop = onSnapshot(SNAPSHOT_REF(), { includeMetadataChanges: true }, (snapshot) => {
      window.clearTimeout(timer)
      if (snapshot.metadata.fromCache) timer = window.setTimeout(() => setWeak(true), 8000)
      else setWeak(false)
    }, () => undefined)
    timer = window.setTimeout(() => setWeak(true), 12000)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.clearTimeout(timer)
      stop()
    }
  }, [])

  if (!offline && !weak) return null
  return (
    <div className="connection-banner" role="status">
      {offline ? <WifiOff size={15} aria-hidden="true" /> : <CloudOff size={15} aria-hidden="true" />}
      <span>{offline ? "You're offline — showing saved info. It updates when you're back online." : 'Weak connection — showing saved info. Updating when the connection improves.'}</span>
    </div>
  )
}
