import { CircleCheck, History } from 'lucide-react'
import MatchCard from '../components/MatchCard'
import CompetitionTabs from '../components/CompetitionTabs'
import { filterLabel, useCompetitionFilter } from '../hooks/useCompetitionFilter'
import { matchesFilter } from '../utils/competitions'
import { Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture } from '../types'
import { ekhayaOutcome, sortByDate } from '../utils/football'

export default function Results() {
  const { items, loading, error } = useFirestoreCollection<Fixture>('fixtures')
  const [filter, setFilter] = useCompetitionFilter()
  const results = sortByDate(items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest && matchesFilter(fixture.competition, filter)), 'desc')
  const form = results
    .filter((fixture) => fixture.home.toLowerCase() === 'ekhaya fc' || fixture.away.toLowerCase() === 'ekhaya fc')
    .slice(0, 5)
    .map(ekhayaOutcome)
    .filter((result): result is 'W' | 'D' | 'L' => result !== null)

  return <>
    <PageHeader eyebrow={filterLabel(filter)} title="Results" description="Latest completed matches" />
    <CompetitionTabs value={filter} onChange={setFilter} />
    {!loading && !error && form.length > 0 && (
      <Card className="form-card">
        <div className="form-summary-heading"><span>EKHAYA FC</span><span>LAST {form.length}</span></div>
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
