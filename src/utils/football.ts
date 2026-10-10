import type { Fixture } from '../types'

const CAT_TIME_ZONE = 'Africa/Blantyre'

export function formatMalawiDate(date: string) {
  return new Intl.DateTimeFormat('en-MW', {
    timeZone: CAT_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatMalawiTime(date: string) {
  return new Intl.DateTimeFormat('en-MW', {
    timeZone: CAT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date))
}

/** A finished match that staff reopened to correct still counts as a result for fans. */
export function isPlayed(fixture: Fixture) {
  return fixture.status === 'finished' || (fixture.status === 'live' && Boolean(fixture.editing))
}

/** Live for fans: a match being edited after full time is not live. */
export function isLiveNow(fixture: Fixture) {
  return fixture.status === 'live' && !fixture.editing
}

export function ekhayaOutcome(fixture: Fixture): 'W' | 'D' | 'L' | null {
  if (!isPlayed(fixture) || fixture.homeScore == null || fixture.awayScore == null) return null
  const isHome = fixture.home.toLocaleLowerCase() === 'ekhaya fc'
  const isAway = fixture.away.toLocaleLowerCase() === 'ekhaya fc'
  if (!isHome && !isAway) return null
  const ekhayaGoals = isHome ? fixture.homeScore : fixture.awayScore
  const opponentGoals = isHome ? fixture.awayScore : fixture.homeScore
  return ekhayaGoals === opponentGoals ? 'D' : ekhayaGoals > opponentGoals ? 'W' : 'L'
}

export function sortByDate<T extends { date: string }>(items: T[], direction: 'asc' | 'desc') {
  return [...items].sort((a, b) => {
    const difference = new Date(a.date).getTime() - new Date(b.date).getTime()
    return direction === 'asc' ? difference : -difference
  })
}