import { createContext } from 'react'

export type InstallPromptValue = {
  canPromptInstall: boolean
  installed: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>
}

export const InstallPromptContext = createContext<InstallPromptValue | null>(null)