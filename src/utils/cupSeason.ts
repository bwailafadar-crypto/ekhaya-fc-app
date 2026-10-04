// Ekhaya's season in each cup: which matches, how far they went, trophy photos.
import type { Fixture } from '../types'
import { competitionOf } from './competitions'
import { ekhayaOutcome, sortByDate } from './football'

export const SEASON = '2026'

// Trophy photos for cups Ekhaya won, by cup and season.
export const TROPHY_PHOTOS: Record<string, { src: string; caption: string }> = {
  'airtel-top-8-2026': { src: './cups/airtel-top-8-2026.jpg', caption: 'Ekhaya FC lift the 2026 Airtel Top 8 trophy' },
}
export const isEkhaya = (name: string) => name.trim().toLowerCase() === 'ekhaya fc'

export function inSeason(fixture: Fixture) {
  return !fixture.isTest && (fixture.season === SEASON || fixture.date?.startsWith(SEASON))
}

export function opponent(fixture: Fixture) {
  return isEkhaya(fixture.home) ? fixture.away : fixture.home
}

/** How Ekhaya's cup run ended (or where it stands). */
export function cupStatus(matches: Fixture[]) {
  if (!matches.length) return { label: 'No matches yet', variant: 'default' as const }
  const last = matches[matches.length - 1]
  const final = matches.find((match) => /^final$/i.test(match.round ?? ''))
  if (final && final.status === 'finished') {
    const won = ekhayaOutcome(final) === 'W' || /ekhaya (won|win)/i.test(final.note ?? '')
    return won ? { label: '🏆 Champions', variant: 'gold' as const } : { label: 'Runners-up', variant: 'default' as const }
  }
  if (matches.some((match) => match.status === 'upcoming' || match.status === 'live')) return { label: 'Still in it', variant: 'success' as const }
  return { label: last.round ? `Out in ${last.round.split('·')[0].trim().toLowerCase()}` : 'Knocked out', variant: 'danger' as const }
}


/** Ekhaya's matches in one cup this season, oldest first. */
export function cupMatches(fixtures: Fixture[], cupId: string) {
  return sortByDate(fixtures.filter((fixture) => inSeason(fixture) && (isEkhaya(fixture.home) || isEkhaya(fixture.away))
    && competitionOf(fixture.competition).id === cupId), 'asc')
}
