import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { APK_PATH, APK_URL } from '../utils/appShell'

// Optional Android download. Uses VITE_APK_URL when set (e.g. Google Drive);
// otherwise only shown once a signed APK exists at /downloads, so fans never
// hit a broken link.
export default function ApkDownload() {
  const [available, setAvailable] = useState(Boolean(APK_URL))
  const href = APK_URL || APK_PATH

  useEffect(() => {
    if (APK_URL) return
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
    <a className="button button-secondary" href={href} download="EkhayaFC.apk" target={APK_URL ? '_blank' : undefined} rel={APK_URL ? 'noreferrer' : undefined}>
      <Smartphone size={16} aria-hidden="true" />Or download the Android app (APK)
    </a>
    <p>If your phone blocks it: Settings &gt; Security &gt; allow installing from this source. Samsung: turn off Auto Blocker temporarily.</p>
  </div>
}
