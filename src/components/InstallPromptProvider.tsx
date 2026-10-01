import { useEffect, useState, type ReactNode } from 'react'
import { InstallPromptContext } from './installPromptContext'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true)
}

export default function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isInstalled)

  useEffect(() => {
    function captureInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    function markInstalled() {
      setInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!installPrompt) return null
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    setInstallPrompt(null)
    if (outcome === 'accepted') setInstalled(true)
    return outcome
  }

  return <InstallPromptContext.Provider value={{ canPromptInstall: Boolean(installPrompt), installed, promptInstall }}>{children}</InstallPromptContext.Provider>
}