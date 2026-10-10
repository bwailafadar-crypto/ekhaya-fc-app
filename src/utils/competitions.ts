// The club's competitions. Cup matches never change the league table.
export type CompetitionKind = 'league' | 'cup'
export type Competition = { id: string; name: string; short: string; kind: CompetitionKind }

export const COMPETITIONS: Competition[] = [
  { id: 'league', name: 'FDH Championship', short: 'League', kind: 'league' },
  { id: 'airtel-top-8', name: 'Airtel Top 8', short: 'Airtel Top 8', kind: 'cup' },
  { id: 'castel-cup', name: 'Castel Cup', short: 'Castel Cup', kind: 'cup' },
]

export const CUPS = COMPETITIONS.filter((item) => item.kind === 'cup')

function norm(name: string | undefined) {
  return String(name ?? '').trim().toLowerCase()
}

/** Which competition a fixture belongs to (anything unknown counts as the league). */
export function competitionOf(name: string | undefined): Competition {
  const value = norm(name)
  if (/top\s*8/.test(value)) return COMPETITIONS[1]
  if (/castel/.test(value)) return COMPETITIONS[2]
  return COMPETITIONS[0]
}

/** The name fans see. Older matches saved under the league's previous name show the current one. */
export function competitionLabel(name: string | undefined) {
  return competitionOf(name).name
}

export function isCupCompetition(name: string | undefined) {
  return competitionOf(name).kind === 'cup'
}

/** Filter values used on the Results and Fixtures pages. */
export type CompetitionFilter = 'all' | 'league' | 'cups' | string

export function matchesFilter(name: string | undefined, filter: CompetitionFilter) {
  const competition = competitionOf(name)
  if (filter === 'all') return true
  if (filter === 'cups') return competition.kind === 'cup'
  return competition.id === filter
}
