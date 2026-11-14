import { CircleCheck, History } from 'lucide-react'
import MatchCard from '../components/MatchCard'
import CompetitionTabs from '../components/CompetitionTabs'
import { filterLabel, useCompetitionFilter } from '../hooks/useCompetitionFilter'
import { ChampionsCelebration } from '../components/CupCard'
import { CUPS, matchesFilter } from '../utils/competitions'
import { cupMatches, cupStatus } from '../utils/cupSeason'
import { Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { inSquad, type Squad } from '../hooks/useSquad'
import type { Fixture } from '../types'
import { ekhayaOutcome, isEkhayaTeam, isPlayed, sortByDate } from '../utils/football'

export default function Results({ squad = 'men' }: { squad?: Squad }) {
  const { items: all, loading, error } = useFirestoreCollection<Fixture>('fixtures')
  const [filter, setFilter] = useCompetitionFilter()
  const items = all.filter((fixture) => inSquad(fixture.squad, squad))
  const results = sortByDate(items.filter((fixture) => isPlayed(fixture) && !fixture.isTest && matchesFilter(fixture.competition, filter)), 'desc')
  const form = results
    .filter((fixture) => isEkhayaTeam(fixture.home) || isEkhayaTeam(fixture.away))
    .slice(0, 5)
    .map(ekhayaOutcome)
    .filter((result): result is 'W' | 'D' | 'L' => result !== null)

  // A cup Ekhaya won gets the trophy celebration at the top of its results.
  const wonCups = CUPS.filter((cup) => filter === 'cups' || cup.id === filter).flatMap((cup) => {
    const matches = cupMatches(items, cup.id)
    const final = matches.find((match) => /^final$/i.test(match.round ?? ''))
    return final && cupStatus(matches).label.includes('Champions') ? [{ cup, final }] : []
  })

  return <>
    <PageHeader eyebrow={squad === 'women' ? "The Cowgirls" : filterLabel(filter)} title={squad === 'women' ? "Women's results" : 'Results'} description="Latest completed matches" />
    {squad === 'men' && <CompetitionTabs value={filter} onChange={setFilter} />}
    {!loading && wonCups.map(({ cup, final }) => <ChampionsCelebration key={cup.id} cup={cup} final={final} />)}
    {!loading && !error && form.length > 0 && (
      <Card className="form-card">
        <div className="form-summary-heading"><span>{squad === 'women' ? 'EKHAYA WOMEN' : 'EKHAYA FC'}</span><span>LAST {form.length}</span></div>
        <div className="form-dots" aria-label={`Recent form ${form.join(' ')}`}>
          {form.map((result, index) => <span key={`${result}-${index}`} className={`form-dot form-dot-${result.toLowerCase()}`} aria-label={result}>{result}</span>)}
        </div>
      </Card>
    )}
    {loading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={History} title="Results unavailable" description={error} />
        : results.length ? results.map((fixture) => <MatchCard key={fixture.id} fixture={fixture} />)
          : <EmptyState icon={CircleCheck} title="No results yet" description={filter === 'all' ? 'Finished matches will show here.' : `No ${filterLabel(filter)} results yet.`} />}
  </>
}
