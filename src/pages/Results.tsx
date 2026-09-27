import { CircleCheck, History } from 'lucide-react'
import MatchCard from '../components/MatchCard'
import { Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture } from '../types'
import { ekhayaOutcome, sortByDate } from '../utils/football'

export default function Results() {
  const { items, loading, error } = useFirestoreCollection<Fixture>('fixtures')
  const results = sortByDate(items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest), 'desc')
  const form = results
    .filter((fixture) => fixture.home.toLowerCase() === 'ekhaya fc' || fixture.away.toLowerCase() === 'ekhaya fc')
    .slice(0, 5)
    .map(ekhayaOutcome)
    .filter((result): result is 'W' | 'D' | 'L' => result !== null)

  return <>
    <PageHeader eyebrow="TNM Super League" title="Results" description="Latest completed matches" />
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
          : <EmptyState icon={CircleCheck} title="No results yet" description="Finished matches will show here." />}
  </>
}
