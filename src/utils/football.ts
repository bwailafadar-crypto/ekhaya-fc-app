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

export function ekhayaOutcome(fixture: Fixture): 'W' | 'D' | 'L' | null {
  if (fixture.status !== 'finished' || fixture.homeScore == null || fixture.awayScore == null) return null
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