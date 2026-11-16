import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { config } from '../config'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import type { Fixture, MatchEvent, NewsItem } from '../types'
import { cardAlert, isClubMatch, matchAlerts, newsAlert, type PlannedAlert } from '../utils/alertRules'
import { dispatchAlert, githubKey } from '../utils/githubAlerts'
import { recalculateLeaderboard } from '../utils/leaderboardStore'
import { useToast } from './ToastContext'

async function latestGoal(fixtureId: string, team: string) {
  try {
    const events = await getDocs(query(collection(db, 'fixtures', fixtureId, 'events'), orderBy('createdAt', 'desc'), limit(6)))
    const goal = events.docs.map((item) => item.data()).find((event) => event.kind === 'goal' && String(event.team || '').toLowerCase() === team.toLowerCase())
    return {
      line: goal ? `${goal.minute ?? ''}' ${goal.playerName || team}`.trim() : team,
      playerId: typeof goal?.playerId === 'string' ? goal.playerId : '',
      playerName: typeof goal?.playerName === 'string' ? goal.playerName : '',
      minute: goal?.minute,
    }
  } catch {
    return { line: team, playerId: '', playerName: '', minute: undefined }
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
  // Only the live app sends push alerts (never staging or a laptop copy).
  const isAdmin = (role === 'admin' || role === 'superadmin') && config.environment === 'production'

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
      const goal = alert.scorerTeam && fixtureId ? await latestGoal(fixtureId, alert.scorerTeam) : null
      const body = goal ? goal.line : alert.body
      // Fans following the scorer get their own alert ("Allen Chihana scores!") instead.
      const player = goal?.playerId && /ekhaya/i.test(alert.scorerTeam ?? '') ? goal.playerId : ''
      if (player && goal) {
        const playerLock = doc(db, 'alertsSent', `${alert.key.replace(/\//g, '_')}-p`)
        const sendPlayer = await setDoc(playerLock, { title: `${goal.playerName} scores`.slice(0, 200), createdAt: serverTimestamp() }).then(() => true, () => false)
        if (sendPlayer) await dispatchAlert({ kind: 'player', player, title: `⚽ ${goal.playerName || 'Your player'} scores!`, body: `${goal.minute ?? ''}' · ${alert.title.replace(/^GOAL! /, '')}`, path: alert.path }).catch(() => deleteDoc(playerLock).catch(() => undefined))
      }
      try {
        await dispatchAlert({ kind: alert.kind, title: alert.title, body, path: alert.path, ...(player ? { player } : {}) })
        if (active) showToast(`Alert sent to fans: ${alert.title}`, 'info')
      } catch {
        // Release the lock so the alert can be sent again (by this or another admin).
        await deleteDoc(lock).catch(() => undefined)
        if (active) showToast('The fan alert could not be sent. Check Admin → Fan Zone → Push alerts.', 'error')
      }
    }

    // Cards come from the commentary, so listen to the events of live Ekhaya matches.
    const eventWatchers = new Map<string, () => void>()
    const watchEvents = (fixture: Fixture) => {
      const live = fixture.status === 'live' && !fixture.isTest && isClubMatch(fixture)
      if (live && !eventWatchers.has(fixture.id)) {
        let ready = false
        eventWatchers.set(fixture.id, onSnapshot(collection(db, 'fixtures', fixture.id, 'events'), (snapshot) => {
          if (ready) snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return
            const current = lastFixtures.get(fixture.id) ?? fixture
            const alert = cardAlert(current, { ...(change.doc.data() as MatchEvent), id: change.doc.id })
            if (alert) void send(alert, fixture.id)
          })
          ready = true
        }, () => undefined))
      }
      if (!live && eventWatchers.has(fixture.id)) { eventWatchers.get(fixture.id)?.(); eventWatchers.delete(fixture.id) }
    }

    const stopFixtures = onSnapshot(collection(db, 'fixtures'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const after = { ...(change.doc.data() as Fixture), id: change.doc.id }
        if (change.type !== 'removed') watchEvents(after)
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

    // Fan points also change between matches (poll votes, new
    // predictions): refresh the boards when they are more than 2 hours old,
    // checked shortly after an admin opens the app and every 30 minutes.
    const refreshPointsIfOld = async () => {
      try {
        const board = await getDoc(doc(db, 'leaderboard', 'fans'))
        const updated = board.data()?.updatedAt?.toMillis?.() ?? 0
        if (Date.now() - updated > 2 * 3600000) await recalculateLeaderboard(false)
      } catch { /* offline: try again later */ }
    }
    const pointsFirst = window.setTimeout(() => void refreshPointsIfOld(), 20000)
    const pointsTimer = window.setInterval(() => void refreshPointsIfOld(), 30 * 60000)

    return () => { active = false; window.clearTimeout(leaderboardTimer); window.clearTimeout(pointsFirst); window.clearInterval(pointsTimer); eventWatchers.forEach((stop) => stop()); stopFixtures(); stopNews() }
  }, [isAdmin, showToast])

  return null
}
