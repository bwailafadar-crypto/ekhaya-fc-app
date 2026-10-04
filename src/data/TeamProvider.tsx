import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Team } from '../types'
import { TeamContext } from './TeamContext'

/** Club names and logos for every page (from the shared public snapshot for fans). */
export default function TeamProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const signedIn = !authLoading && user != null
  const teams = useFirestoreCollection<Team>('teams', signedIn)
  const value = {
    teams: signedIn ? teams.items : [],
    loading: authLoading || (signedIn && teams.loading),
  }
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}
