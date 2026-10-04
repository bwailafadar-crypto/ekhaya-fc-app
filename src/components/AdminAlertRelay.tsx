import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import type { Fixture, NewsItem } from '../types'
import { matchAlerts, newsAlert, type PlannedAlert } from '../utils/alertRules'
import { dispatchAlert, githubKey } from '../utils/githubAlerts'
import { recalculateLeaderboard } from '../utils/leaderboardStore'
import { useToast } from './ToastContext'

async function scorerLine(fixtureId: string, team: string) {
  try {
    const events = await getDocs(query(collection(db, 'fixtures', fixtureId, 'events'), orderBy('createdAt', 'desc'), limit(6)))
    const goal = events.docs.map((item) => item.data()).find((event) => event.kind === 'goal' && String(event.team || '').toLowerCase() === team.toLowerCase())
    return goal ? `${goal.minute ?? ''}' ${goal.playerName || team}`.trim() : team
  } catch {
    return team
  }
}

/**
 * Runs inside admin apps. When a match or news change should alert fans, it
 * takes a one-time lock (alertsSent/{key}) and asks GitHub to send the alert.
 * If several admins are online, only the first one's lock succeeds.
 */
export default function AdminAlertRelay() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const isAdmin = role === 'admin' || role === 'superadmin'

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    const lastFixtures = new Map<string, Fixture>()
    const lastNews = new Map<string, Pick<NewsItem, 'status'>>()
    let fixturesReady = false
    let leaderboardTimer: number | undefined
    // Results changed (full time, corrected score or reset): update the saved
    // prediction league once things settle.
    const scheduleLeaderboard = () => {
      window.clearTimeout(leaderboardTimer)
      leaderboardTimer = window.setTimeout(() => { void recalculateLeaderboard(false).catch(() => undefined) }, 4000)
    }
    let newsReady = false

    async function send(alert: PlannedAlert, fixtureId?: string) {
      if (!(await githubKey())) return // alerts not set up yet
      const lock = doc(db, 'alertsSent', alert.key.replace(/\//g, '_'))
      try {
        await setDoc(lock, { title: alert.title.slice(0, 200), createdAt: serverTimestamp() })
      } catch {
        return // another admin already sent it
      }
      const body = alert.scorerTeam && fixtureId ? await scorerLine(fixtureId, alert.scorerTeam) : alert.body
      try {
        await dispatchAlert({ kind: alert.kind, title: alert.title, body, path: alert.path })
        if (active) showToast(`Alert sent to fans: ${alert.title}`, 'info')
      } catch {
        // Release the lock so the alert can be sent again (by this or another admin).
        await deleteDoc(lock).catch(() => undefined)
        if (active) showToast('The fan alert could not be sent. Check Admin → Fan Zone → Push alerts.', 'error')
      }
    }

    const stopFixtures = onSnapshot(collection(db, 'fixtures'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const after = { ...(change.doc.data() as Fixture), id: change.doc.id }
        const before = lastFixtures.get(change.doc.id)
        if (change.type === 'removed') { lastFixtures.delete(change.doc.id); return }
        lastFixtures.set(change.doc.id, after)
        if (fixturesReady) matchAlerts(before, after).forEach((alert) => void send(alert, after.id))
        if (fixturesReady && before && !after.isTest && (before.status === 'finished' || after.status === 'finished')
          && (before.status !== after.status || before.homeScore !== after.homeScore || before.awayScore !== after.awayScore)) scheduleLeaderboard()
      })
      fixturesReady = true
    }, () => undefined)

    const stopNews = onSnapshot(collection(db, 'news'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') { lastNews.delete(change.doc.id); return }
        const data = change.doc.data() as NewsItem
        const before = lastNews.get(change.doc.id)
        lastNews.set(change.doc.id, { status: data.status })
        if (!newsReady) return
        const alert = newsAlert(before, { id: change.doc.id, status: data.status, title: data.title })
        if (alert) void send(alert)
      })
      newsReady = true
    }, () => undefined)

    return () => { active = false; window.clearTimeout(leaderboardTimer); stopFixtures(); stopNews() }
  }, [isAdmin, showToast])

  return null
}
