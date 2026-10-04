import { doc, getDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { claimInvite, refreshCommunityStats, STATS_MAX_AGE } from '../utils/community'

/** Background jobs: credit the friend who invited this fan, and keep branch numbers fresh (admins). */
export default function CommunitySync() {
  const { user, emailVerified, role } = useAuth()
  const uid = user?.uid
  const isAdmin = role === 'admin' || role === 'superadmin'

  useEffect(() => {
    if (uid && emailVerified) void claimInvite(uid)
  }, [uid, emailVerified])

  useEffect(() => {
    if (!isAdmin) return
    const timer = window.setTimeout(() => {
      void getDoc(doc(db, 'communityStats', 'current')).then((snapshot) => {
        const updated = snapshot.data()?.updatedAt?.toMillis?.() ?? 0
        if (Date.now() - updated > STATS_MAX_AGE) return refreshCommunityStats(false)
      }).catch(() => undefined)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [isAdmin])

  return null
}
