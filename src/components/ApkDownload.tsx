import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { APK_PATH } from '../utils/appShell'

// Optional Android download. Only shown once a signed APK has actually been
// published to /downloads, so fans never hit a broken link.
export default function ApkDownload() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let active = true
    fetch(APK_PATH, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        const type = response.headers.get('content-type') ?? ''
        if (active) setAvailable(response.ok && !type.includes('text/html'))
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  if (!available) return null

  return <div className="install-apk">
    <a className="button button-secondary" href={APK_PATH} download="EkhayaFC.apk">
      <Smartphone size={16} aria-hidden="true" />Or download the Android app (APK)
    </a>
    <p>If your phone blocks it: Settings &gt; Security &gt; allow installing from this source. Samsung: turn off Auto Blocker temporarily.</p>
  </div>
}
