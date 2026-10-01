import { Download, X } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useInstallPrompt } from './useInstallPrompt'
import { isAndroidApp } from '../utils/appShell'

const DISMISS_KEY = 'ekhaya-install-banner-dismissed'

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

export default function InstallBanner() {
  const location = useLocation()
  const { canPromptInstall, installed, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [installing, setInstalling] = useState(false)
  const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Keep dismissal for this session when storage is unavailable.
    }
    setDismissed(true)
  }

  async function install() {
    setInstalling(true)
    const choice = await promptInstall()
    setInstalling(false)
    if (choice === 'accepted') dismiss()
  }

  if (dismissed || installed || isAndroidApp() || location.pathname === '/install') return null

  return (
    <aside className="install-banner" aria-label="Install Ekhaya FC">
      <span className="install-banner-icon"><Download size={17} aria-hidden="true" /></span>
      <div className="install-banner-copy">
        <strong>Install the app</strong>
        <span>{isIPhone ? 'Safari > Share > Add to Home Screen.' : 'Add Ekhaya FC to your home screen for quick access.'}</span>
      </div>
      {canPromptInstall && <button className="install-banner-action" type="button" onClick={() => void install()} disabled={installing}>
        {installing ? 'Installing...' : 'Install'}
      </button>}
      <button className="install-banner-dismiss" type="button" onClick={dismiss} aria-label="Dismiss install banner">
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  )
}