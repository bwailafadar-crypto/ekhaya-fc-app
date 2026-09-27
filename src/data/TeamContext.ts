import { createContext, useContext } from 'react'
import type { Team } from '../types'

export type TeamContextValue = { teams: Team[]; loading: boolean }
export const TeamContext = createContext<TeamContextValue>({ teams: [], loading: true })

export function useTeams() {
  return useContext(TeamContext)
}