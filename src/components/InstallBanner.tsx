import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'ekhaya-install-banner-dismissed'

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true)
}

export default function InstallBanner() {
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const installed = isInstalled()
  const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Keep dismissal for this session when storage is unavailable.
    }
    setDismissed(true)
  }

  async function install() {
    if (!installPrompt) return
    setInstalling(true)
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setInstalling(false)
    if (choice.outcome === 'accepted') dismiss()
  }

  if (dismissed || installed) return null

  return (
    <aside className="install-banner" aria-label="Install Ekhaya FC">
      <span className="install-banner-icon"><Download size={17} aria-hidden="true" /></span>
      <div className="install-banner-copy">
        <strong>Install the app</strong>
        <span>{isIPhone ? 'Safari > Share > Add to Home Screen.' : 'Add Ekhaya FC to your home screen for quick access.'}</span>
      </div>
      {installPrompt && <button className="install-banner-action" type="button" onClick={() => void install()} disabled={installing}>
        {installing ? 'Installing...' : 'Install'}
      </button>}
      <button className="install-banner-dismiss" type="button" onClick={dismiss} aria-label="Dismiss install banner">
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  )
}