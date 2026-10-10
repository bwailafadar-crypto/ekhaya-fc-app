import { CalendarDays, Shield, Table2, Trophy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import CupCard from '../components/CupCard'
import { Badge, Card, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, Standing } from '../types'
import { CUPS, competitionOf } from '../utils/competitions'
import { SEASON, cupMatches, inSeason, isEkhaya, opponent } from '../utils/cupSeason'
import { ekhayaOutcome, formatMalawiDate, isPlayed, sortByDate } from '../utils/football'

function LeagueCard({ fixtures, standings, loading }: { fixtures: Fixture[]; standings: Standing[]; loading: boolean }) {
  const row = standings.find((item) => item.id === 'ekhaya-fc' || isEkhaya(item.team))
  const played = fixtures.filter(isPlayed)
  const outcomes = played.map(ekhayaOutcome)
  const count = (value: 'W' | 'D' | 'L') => outcomes.filter((item) => item === value).length
  const next = sortByDate(fixtures.filter((fixture) => fixture.status === 'upcoming'), 'asc')[0]
  return (
    <Card className="fz-card">
      <div className="cup-card-head">
        <span className="cup-card-icon cup-card-icon-league" aria-hidden="true"><Shield size={20} /></span>
        <div><h2>FDH Championship</h2><span>{SEASON} season</span></div>
        {row && <Badge variant="gold">{row.position}{['st', 'nd', 'rd'][((row.position + 90) % 100 - 10) % 10 - 1] ?? 'th'} · {row.points} pts</Badge>}
      </div>
      {loading ? <Skeleton className="fz-board-skeleton" /> : <>
        <div className="league-record">
          <div><strong>{played.length}</strong><span>Played</span></div>
          <div><strong>{count('W')}</strong><span>Won</span></div>
          <div><strong>{count('D')}</strong><span>Drawn</span></div>
          <div><strong>{count('L')}</strong><span>Lost</span></div>
        </div>
        {next && <p className="fz-note">Next: {isEkhaya(next.home) ? 'v' : '@'} {opponent(next)} · {formatMalawiDate(next.date)}</p>}
      </>}
      <div className="league-links">
        <Link to="/table"><Table2 size={16} aria-hidden="true" /> Table</Link>
        <Link to="/results?c=league"><Trophy size={16} aria-hidden="true" /> Results</Link>
        <Link to="/fixtures?c=league"><CalendarDays size={16} aria-hidden="true" /> Fixtures</Link>
      </div>
    </Card>
  )
}

export default function Competitions() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cups' ? 'cups' : 'league'
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const standings = useFirestoreCollection<Standing>('standings')
  const season = fixtures.items.filter((fixture) => inSeason(fixture) && (isEkhaya(fixture.home) || isEkhaya(fixture.away)))
  const league = season.filter((fixture) => competitionOf(fixture.competition).kind === 'league')

  return <div className="fan-zone">
    <PageHeader eyebrow={`${SEASON} season`} title="Competitions" description="Ekhaya FC in the league and the cups." />
    <div className="comp-tabs"><div className="comp-tabs-row comp-tabs-big" role="tablist" aria-label="Competition type">
      <button type="button" role="tab" aria-selected={tab === 'league'} className={tab === 'league' ? 'active' : undefined} onClick={() => setParams({}, { replace: true })}><Shield size={16} aria-hidden="true" /> League</button>
      <button type="button" role="tab" aria-selected={tab === 'cups'} className={tab === 'cups' ? 'active' : undefined} onClick={() => setParams({ tab: 'cups' }, { replace: true })}><Trophy size={16} aria-hidden="true" /> Cups</button>
    </div></div>
    {fixtures.error && <p className="live-error" role="alert">Matches could not be loaded. Check your connection.</p>}
    {tab === 'league'
      ? <LeagueCard fixtures={league} standings={standings.items} loading={fixtures.loading || standings.loading} />
      : fixtures.loading ? <Skeleton className="fz-board-skeleton" />
        : CUPS.map((cup) => <CupCard key={cup.id} cup={cup} matches={cupMatches(fixtures.items, cup.id)} />)}
  </div>
}
