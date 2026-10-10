import { MapPin, Trophy } from 'lucide-react'
import { competitionLabel, isCupCompetition } from '../utils/competitions'
import type { Fixture } from '../types'
import { ekhayaOutcome, formatMalawiDate, formatMalawiTime, isLiveNow, isPlayed } from '../utils/football'
import TeamLogo from './TeamLogo'
import { Badge, Card } from './UI'

export default function MatchCard({ fixture, previousMeeting }: { fixture: Fixture; previousMeeting?: Fixture }) {
  const played = fixture.status === 'finished' || fixture.status === 'live'
  const outcome = ekhayaOutcome(fixture)
  const score = played && fixture.homeScore != null && fixture.awayScore != null
    ? `${fixture.homeScore} - ${fixture.awayScore}`
    : formatMalawiTime(fixture.date)

  return (
    <Card className="match-card">
      <div className="match-card-meta">
        <span className={isCupCompetition(fixture.competition) ? 'match-card-cup' : undefined}>
          {isCupCompetition(fixture.competition) && <Trophy size={12} aria-hidden="true" />}
          {competitionLabel(fixture.competition)}{fixture.round ? ` · ${fixture.round}` : ''}
        </span>
        {outcome
          ? <Badge variant={outcome === 'W' ? 'success' : outcome === 'D' ? 'default' : 'danger'}>{outcome}</Badge>
          : isLiveNow(fixture) ? <Badge variant="live">LIVE</Badge> : <span className="match-status">{isPlayed(fixture) ? 'FT' : 'FIXTURE'}</span>}
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
      {fixture.note && <p className="match-card-note">{fixture.note}</p>}
      {previousMeeting && previousMeeting.homeScore != null && previousMeeting.awayScore != null && <div className="match-previous-result">
        <span>Previous meeting</span>
        <strong>{previousMeeting.home} {previousMeeting.homeScore} - {previousMeeting.awayScore} {previousMeeting.away}</strong>
        <time>{formatMalawiDate(previousMeeting.date)}</time>
      </div>}
      <div className="match-card-footer">
        <span>{formatMalawiDate(fixture.date)} · CAT</span>
        <span><MapPin size={13} aria-hidden="true" />{fixture.venue || 'Venue TBC'}</span>
      </div>
    </Card>
  )
}