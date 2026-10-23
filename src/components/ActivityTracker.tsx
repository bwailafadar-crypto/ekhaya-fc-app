// Records when each signed-in fan was last in the app and how many minutes
// they spend in it (only while the app is on screen). One small write when the
// app opens and then at most one every 5 minutes, to keep the database free.
// The superadmin sees it in Admin → Fans.
import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'

const TICK = 15_000
const FLUSH_SECONDS = 300
const DAY_KEY = 'ekhaya-activity-day'
const VISIT_KEY = 'ekhaya-activity-visit'

const malawiDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Blantyre' }).format(new Date())

export default function ActivityTracker() {
  const { user, profile } = useAuth()
  const uid = user && profile ? user.uid : ''

  useEffect(() => {
    if (!uid) return
    let seconds = 0
    let writing = false
    let visit = false
    try { visit = sessionStorage.getItem(VISIT_KEY) !== uid; sessionStorage.setItem(VISIT_KEY, uid) } catch { visit = true }

    async function flush() {
      if (writing) return
      const minutes = Math.floor(seconds / 60)
      if (!minutes && !visit) return
      writing = true
      const today = malawiDay()
      let sameDay = false
      try { sameDay = localStorage.getItem(DAY_KEY) === `${uid}:${today}` } catch { /* storage blocked */ }
      try {
        await setDoc(doc(db, 'activity', uid), {
          lastSeenAt: serverTimestamp(), day: today,
          minutesTotal: increment(minutes), minutesToday: sameDay ? increment(minutes) : minutes,
          visits: increment(visit ? 1 : 0),
        }, { merge: true })
        seconds -= minutes * 60
        visit = false
        try { localStorage.setItem(DAY_KEY, `${uid}:${today}`) } catch { /* storage blocked */ }
      } catch { /* offline or too soon: kept for the next write */ } finally { writing = false }
    }

    void flush()
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      seconds += TICK / 1000
      if (seconds >= FLUSH_SECONDS) void flush()
    }, TICK)
    const onHide = () => { if (document.visibilityState === 'hidden' && seconds >= 60) void flush() }
    document.addEventListener('visibilitychange', onHide)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onHide); void flush() }
  }, [uid])

  return null
}
