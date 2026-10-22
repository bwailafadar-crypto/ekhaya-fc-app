// Match alerts INSIDE the app for every fan (no notification permission
// needed): while the app is open on any page, a banner drops down for team
// news, kick-off, goals (with the scorer), yellow and red cards, half-time and
// full time, with a short sound and a vibration on Android.
import { collection, onSnapshot } from 'firebase/firestore'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, MatchEvent } from '../types'
import { cardAlert, isClubMatch, matchAlerts } from '../utils/alertRules'

type Banner = { key: string; tone: 'goal' | 'yellow' | 'red' | 'info' | 'whistle'; title: string; body: string; path: string; fixtureId: string }

const SHOWN_KEY = 'ekhaya-live-alerts-shown'
function alreadyShown(key: string) {
  try {
    const list: string[] = JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]')
    if (list.includes(key)) return true
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...list, key].slice(-80)))
  } catch { /* storage blocked */ }
  return false
}

/** A short chime made in the browser (no sound file to download). */
function chime(tone: Banner['tone']) {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const notes = tone === 'goal' ? [523, 659, 784, 1047] : tone === 'red' ? [330, 262] : tone === 'whistle' ? [1568, 1568] : [660, 880]
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone === 'whistle' ? 'square' : 'sine'
      osc.frequency.value = frequency
      const at = ctx.currentTime + index * (tone === 'goal' ? 0.12 : 0.18)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(tone === 'whistle' ? 0.05 : 0.18, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.25)
    })
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1500)
  } catch { /* sound not allowed until the fan has tapped the page once */ }
}

function toneFor(title: string): Banner['tone'] {
  if (/goal/i.test(title)) return 'goal'
  if (/kick-off|full time|half-time|second half/i.test(title)) return 'whistle'
  return 'info'
}

export default function LiveAlerts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const fixtures = useFirestoreCollection<Fixture>('fixtures', Boolean(user))
  const previous = useRef(new Map<string, Fixture>())
  const lastScorerBanner = useRef(new Map<string, number>())
  const ready = useRef(false)
  const [queue, setQueue] = useState<Banner[]>([])
  const current = queue[0]
  const where = useRef({ pathname, search })
  useEffect(() => { where.current = { pathname, search } }, [pathname, search])

  const push = (banner: Banner) => {
    if (alreadyShown(banner.key)) return
    // The match page already shows its own big goal celebration.
    const onThisMatch = where.current.pathname === '/live' && (where.current.search.includes(banner.fixtureId) || !where.current.search.includes('match='))
    if (banner.tone === 'goal' && onThisMatch) return
    setQueue((list) => [...list, banner].slice(-5))
    chime(banner.tone)
    try { navigator.vibrate?.(banner.tone === 'goal' ? [180, 80, 180, 80, 320] : [160]) } catch { /* not supported */ }
  }

  // Team news, kick-off, half-time, full time (and goals as a fallback) from match changes.
  useEffect(() => {
    if (fixtures.loading) return
    for (const fixture of fixtures.items) {
      const before = previous.current.get(fixture.id)
      if (ready.current && before) {
        for (const alert of matchAlerts(before, fixture)) {
          // Goals come with the scorer from the commentary below; this is only a fallback after a short wait.
          if (alert.scorerTeam) {
            const key = alert.key
            window.setTimeout(() => {
              if (Date.now() - (lastScorerBanner.current.get(fixture.id) ?? 0) < 15000) return
              push({ key, tone: 'goal', title: alert.title, body: alert.body, path: alert.path, fixtureId: fixture.id })
            }, 3000)
            continue
          }
          push({ key: alert.key, tone: toneFor(alert.title), title: alert.title, body: alert.body, path: alert.path, fixtureId: fixture.id })
        }
      }
      previous.current.set(fixture.id, fixture)
    }
    ready.current = true
  }, [fixtures.items, fixtures.loading])

  // Goals (with the scorer) and cards from the commentary of the live Ekhaya match.
  const liveMatch = fixtures.items.find((fixture) => fixture.status === 'live' && !fixture.isTest && !fixture.editing && isClubMatch(fixture))
  const liveId = liveMatch?.id ?? ''
  useEffect(() => {
    if (!liveId) return
    let first = true
    return onSnapshot(collection(db, 'fixtures', liveId, 'events'), (snapshot) => {
      if (!first) snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const event = { ...(change.doc.data() as MatchEvent), id: change.doc.id }
        const match = previous.current.get(liveId)
        if (!match) return
        if (event.kind === 'goal') {
          const ours = /ekhaya/i.test(event.team)
          const runKey = `${match.id}-${match.kickoffAt?.seconds ?? 'k'}-goal`
          lastScorerBanner.current.set(match.id, Date.now())
          push({ key: `${runKey}-${event.id}`, tone: 'goal', title: `${ours ? 'GOAL! ⚽' : 'Goal'} · ${event.team}`, body: `${event.minute}' ${event.playerName || event.team}${event.assistPlayerName ? ` (assist ${event.assistPlayerName})` : ''}`, path: `/live?match=${match.id}`, fixtureId: match.id })
        }
        const card = cardAlert(match, event)
        if (card) push({ key: card.key, tone: event.card === 'red' ? 'red' : 'yellow', title: card.title.replace(/^\S+\s/, ''), body: card.body, path: card.path, fixtureId: match.id })
      })
      first = false
    }, () => undefined)
  }, [liveId])

  // Each banner shows for 6 seconds.
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => setQueue((list) => list.slice(1)), 6000)
    return () => window.clearTimeout(timer)
  }, [current])

  if (!current) return null
  return <div className={`live-alert live-alert-${current.tone}`} role="status" aria-live="assertive" key={current.key}>
    <button type="button" className="live-alert-main" onClick={() => { setQueue((list) => list.slice(1)); navigate(current.path) }}>
      <span className="live-alert-icon" aria-hidden="true">{current.tone === 'goal' ? '⚽' : current.tone === 'yellow' ? '🟨' : current.tone === 'red' ? '🟥' : current.tone === 'whistle' ? '📣' : '📋'}</span>
      <span className="live-alert-text"><strong>{current.title}</strong><small>{current.body}</small></span>
    </button>
    <button type="button" className="live-alert-close" aria-label="Close" onClick={() => setQueue((list) => list.slice(1))}><X size={16} /></button>
  </div>
}
