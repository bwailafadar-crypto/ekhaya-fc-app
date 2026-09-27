import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import type { Team } from '../types'
import { TeamContext } from './TeamContext'

export default function TeamProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [snapshot, setSnapshot] = useState<{ uid: string; teams: Team[] }>({ uid: '', teams: [] })

  useEffect(() => {
    if (authLoading || !user) return
    const uid = user.uid
    return onSnapshot(collection(db, 'teams'), (teamSnapshot) => {
      setSnapshot({ uid, teams: teamSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Team) })
    }, () => {
      setSnapshot({ uid, teams: [] })
    })
  }, [user, authLoading])

  const isCurrentUser = user != null && snapshot.uid === user.uid
  const value = {
    teams: isCurrentUser ? snapshot.teams : [],
    loading: authLoading || (user != null && !isCurrentUser),
  }

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}