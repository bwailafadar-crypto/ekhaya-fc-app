import { MapPin } from 'lucide-react'
import type { Fixture } from '../types'
import { ekhayaOutcome, formatMalawiDate, formatMalawiTime } from '../utils/football'
import TeamLogo from './TeamLogo'
import { Badge, Card } from './UI'

export default function MatchCard({ fixture }: { fixture: Fixture }) {
  const played = fixture.status === 'finished' || fixture.status === 'live'
  const outcome = ekhayaOutcome(fixture)
  const score = played && fixture.homeScore != null && fixture.awayScore != null
    ? `${fixture.homeScore} - ${fixture.awayScore}`
    : formatMalawiTime(fixture.date)

  return (
    <Card className="match-card">
      <div className="match-card-meta">
        <span>{fixture.competition}</span>
        {outcome
          ? <Badge variant={outcome === 'W' ? 'success' : outcome === 'D' ? 'default' : 'danger'}>{outcome}</Badge>
          : fixture.status === 'live' ? <Badge variant="live">LIVE</Badge> : <span className="match-status">{fixture.status === 'finished' ? 'FT' : 'FIXTURE'}</span>}
      </div>
      <div className="match-card-teams">
        <div className="match-team">
          <TeamLogo name={fixture.home} />
          <span>{fixture.home}</span>
        </div>
        <div className={`match-score${played ? ' score' : ' match-kickoff'}`}>{score}</div>
        <div className="match-team match-team-away">
          <TeamLogo name={fixture.away} />
          <span>{fixture.away}</span>
        </div>
      </div>
      <div className="match-card-footer">
        <span>{formatMalawiDate(fixture.date)} · CAT</span>
        <span><MapPin size={13} aria-hidden="true" />{fixture.venue || 'Venue TBC'}</span>
      </div>
    </Card>
  )
}