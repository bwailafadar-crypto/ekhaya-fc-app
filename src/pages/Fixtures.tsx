import { CalendarDays } from 'lucide-react'
import MatchCard from '../components/MatchCard'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture } from '../types'
import { sortByDate } from '../utils/football'

export default function Fixtures() {
  const { items, loading, error } = useFirestoreCollection<Fixture>('fixtures')
  const fixtures = sortByDate(items.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest), 'asc')

  return <>
    <PageHeader eyebrow="TNM Super League" title="Fixtures" description="Upcoming matches · Malawi time (CAT)" />
    {loading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={CalendarDays} title="Fixtures unavailable" description={error} />
        : fixtures.length ? fixtures.map((fixture) => <MatchCard key={fixture.id} fixture={fixture} />)
          : <EmptyState icon={CalendarDays} title="No upcoming fixtures" description="New matches will appear here when the club adds them." />}
  </>
}
