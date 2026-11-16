// Decides which push alert a match or news change should send.
// Pure functions (no Firebase) so they are easy to test.
import type { Fixture, MatchEvent, NewsItem } from '../types'

export type AlertKind = 'match' | 'news'
export type PlannedAlert = { key: string; kind: AlertKind; title: string; body: string; path: string; scorerTeam?: string }

const CLUB = /ekhaya/i
type FixtureLike = Pick<Fixture, 'id' | 'home' | 'away' | 'status'> & Partial<Fixture>

export function isClubMatch(fixture: FixtureLike) {
  return CLUB.test(fixture.home || '') || CLUB.test(fixture.away || '')
}

function scoreLine(f: FixtureLike) {
  return `${f.home} ${f.homeScore ?? 0}–${f.awayScore ?? 0} ${f.away}`
}

/** Alerts caused by one change to a fixture, each with a unique key for the one-time lock. */
export function matchAlerts(before: FixtureLike | undefined, after: FixtureLike | undefined): PlannedAlert[] {
  // Corrections to a finished match never alert fans.
  if (!before || !after || after.isTest || after.editing || before.editing || !isClubMatch(after)) return []
  const alerts: PlannedAlert[] = []
  // Every kick-off gets its own key, so a reset-and-replayed match alerts again.
  const run = `${after.id}-${after.kickoffAt?.seconds ?? 'k'}`
  const home = after.homeScore ?? 0
  const away = after.awayScore ?? 0
  const wasLive = before.status === 'live'
  const isLive = after.status === 'live'

  // Team news: the starting XI was confirmed before kick-off.
  if (after.status === 'upcoming' && !before.lineupConfirmed && after.lineupConfirmed) {
    const opponent = CLUB.test(after.home) ? after.away : after.home
    alerts.push({ key: `${after.id}-teamnews`, kind: 'match', title: 'Team news is in!', body: `See the Ekhaya FC starting XI v ${opponent}${after.formation ? ` (${after.formation})` : ''}.`, path: `/live?match=${after.id}&tab=lineups` })
  }
  if (before.status === 'upcoming' && isLive) {
    alerts.push({ key: `${run}-kickoff`, kind: 'match', title: `Kick-off! ${after.home} v ${after.away}`, body: 'Follow it live in the Ekhaya FC app.', path: '/live' })
  }
  if (isLive) {
    const homeUp = home > (before.homeScore ?? 0)
    const awayUp = away > (before.awayScore ?? 0)
    if (homeUp || awayUp) {
      const scorerTeam = homeUp ? after.home : after.away
      alerts.push({ key: `${run}-goal-${home}-${away}`, kind: 'match', title: `${CLUB.test(scorerTeam) ? 'GOAL! ' : 'Goal · '}${scoreLine(after)}`, body: scorerTeam, path: '/live', scorerTeam })
    }
    if (before.period !== 'half-time' && after.period === 'half-time') {
      alerts.push({ key: `${run}-ht`, kind: 'match', title: `Half-time: ${scoreLine(after)}`, body: 'Second half coming up.', path: '/live' })
    }
    if (before.period === 'half-time' && after.period === 'second-half') {
      alerts.push({ key: `${run}-2h`, kind: 'match', title: `Second half under way: ${scoreLine(after)}`, body: 'Follow it live in the Ekhaya FC app.', path: '/live' })
    }
  }
  if (wasLive && after.status === 'finished') {
    alerts.push({ key: `${run}-ft`, kind: 'match', title: `Full time: ${scoreLine(after)}`, body: 'Read the match report.', path: `/report/${after.id}` })
  }
  return alerts
}

/** A news alert when an article becomes published (not when a published one is edited). */
export function newsAlert(before: Pick<NewsItem, 'status'> | undefined, after: (Pick<NewsItem, 'status' | 'title'> & { id: string }) | undefined): PlannedAlert | null {
  if (!after || after.status !== 'published') return null
  if (before?.status === 'published') return null
  return { key: `news-${after.id}`, kind: 'news', title: 'Ekhaya FC News', body: String(after.title || 'New article').slice(0, 140), path: `/news/${after.id}` }
}

/** Yellow and red cards in a live Ekhaya match (one alert per card). */
export function cardAlert(fixture: FixtureLike, event: Pick<MatchEvent, 'kind' | 'card' | 'minute' | 'team'> & { id: string; playerName?: string }): PlannedAlert | null {
  if (event.kind !== 'card' || fixture.isTest || fixture.editing || fixture.status !== 'live' || !isClubMatch(fixture)) return null
  const red = event.card === 'red'
  const who = event.playerName ? `${event.playerName} (${event.team})` : event.team
  return {
    key: `${fixture.id}-${fixture.kickoffAt?.seconds ?? 'k'}-card-${event.id}`,
    kind: 'match',
    title: `${red ? '🟥 Red card' : '🟨 Yellow card'} · ${event.minute}'`,
    body: `${who} · ${scoreLine(fixture)}`,
    path: `/live?match=${fixture.id}`,
  }
}
