import { CalendarDays } from 'lucide-react'
import MatchCard from '../components/MatchCard'
import CompetitionTabs from '../components/CompetitionTabs'
import { filterLabel, useCompetitionFilter } from '../hooks/useCompetitionFilter'
import CupCard from '../components/CupCard'
import { CUPS, matchesFilter } from '../utils/competitions'
import { cupMatches } from '../utils/cupSeason'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import SquadTabs from '../components/SquadTabs'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { inSquad, useSquad } from '../hooks/useSquad'
import type { Fixture } from '../types'
import { isPlayed, sortByDate } from '../utils/football'

const teamAliases: Record<string, string> = {
  'big bullets': 'fcb nyasa big bullets',
  'mitundu baptist': 'luanar mitundu',
  'civo united': 'civil service united',
  'dedza dynamos': 'goshen city dedza dynamos',
  mafco: 'mafco f.c',
}

function teamKey(name: string) {
  const key = name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  return teamAliases[key] ?? key
}

export default function Fixtures() {
  const { items: all, loading, error } = useFirestoreCollection<Fixture>('fixtures')
  const [filter, setFilter] = useCompetitionFilter()
  const [squad, setSquad] = useSquad()
  const items = all.filter((fixture) => inSquad(fixture.squad, squad))
  const fixtures = sortByDate(items.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest && matchesFilter(fixture.competition, filter)), 'asc')
  const completed = items.filter((fixture) => isPlayed(fixture) && !fixture.isTest
    && fixture.homeScore != null && fixture.awayScore != null)

  function previousMeeting(fixture: Fixture) {
    return sortByDate(completed.filter((match) => {
      if (new Date(match.date).getTime() >= new Date(fixture.date).getTime()) return false
      return (teamKey(match.home) === teamKey(fixture.home) && teamKey(match.away) === teamKey(fixture.away))
        || (teamKey(match.home) === teamKey(fixture.away) && teamKey(match.away) === teamKey(fixture.home))
    }), 'desc')[0]
  }

  // Picking a cup also shows how Ekhaya's season in it is going (or how it ended).
  // The tracked cup runs are the men's team's, so only show them on the men's tab.
  const cupsShown = squad === 'men' ? (filter === 'cups' ? CUPS : CUPS.filter((cup) => cup.id === filter)) : []

  return <>
    <PageHeader eyebrow={filterLabel(filter)} title="Fixtures" description="Upcoming matches · Malawi time (CAT)" />
    <SquadTabs value={squad} onChange={setSquad} />
    <CompetitionTabs value={filter} onChange={setFilter} />
    {loading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={CalendarDays} title="Fixtures unavailable" description={error} />
        : fixtures.length ? fixtures.map((fixture) => <MatchCard key={fixture.id} fixture={fixture} previousMeeting={previousMeeting(fixture)} />)
          : cupsShown.length ? <p className="cup-fixtures-empty">No upcoming {filterLabel(filter)} matches. Here is Ekhaya's {cupsShown.length > 1 ? 'cup season' : 'run'} so far:</p>
          : <EmptyState icon={CalendarDays} title="No upcoming fixtures" description={filter === 'all' ? 'New matches will appear here when the club adds them.' : `No ${filterLabel(filter)} matches scheduled yet.`} />}
    {!loading && !error && cupsShown.map((cup) => <CupCard key={cup.id} cup={cup} matches={cupMatches(items, cup.id)} />)}
  </>
}
