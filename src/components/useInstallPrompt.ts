import { useContext } from 'react'
import { InstallPromptContext } from './installPromptContext'

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext)
  if (!context) throw new Error('useInstallPrompt must be used within InstallPromptProvider')
  return context
}