import { Goal, MapPin, Pencil, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { competitionLabel, isCupCompetition } from '../utils/competitions'
import type { Fixture } from '../types'
import { ekhayaOutcome, formatMalawiDate, formatMalawiTime, isLiveNow, isPlayed } from '../utils/football'
import TeamLogo from './TeamLogo'
import { scorerText } from '../utils/goals'
import { Badge, Card } from './UI'

export default function MatchCard({ fixture, previousMeeting }: { fixture: Fixture; previousMeeting?: Fixture }) {
  const { role } = useAuth()
  // Tapping a match opens its match centre; admins tapping a result go straight to editing it.
  const canEdit = (role === 'admin' || role === 'superadmin') && isPlayed(fixture) && !fixture.isTest
  const to = !canEdit && fixture.status === 'finished' && !fixture.isTest ? `/report/${encodeURIComponent(fixture.id)}` : `/live?match=${encodeURIComponent(fixture.id)}${canEdit ? '&edit=1' : ''}`
  const played = fixture.status === 'finished' || fixture.status === 'live'
  const outcome = ekhayaOutcome(fixture)
  const score = played && fixture.homeScore != null && fixture.awayScore != null
    ? `${fixture.homeScore} - ${fixture.awayScore}`
    : formatMalawiTime(fixture.date)

  return (
    <Link className="match-card-link" to={to} aria-label={`${fixture.home} v ${fixture.away}: ${canEdit ? 'open to edit' : fixture.status === 'finished' ? 'open match report' : 'open match centre'}`}>
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
      {fixture.goals && played && (scorerText(fixture.goals, 'home') || scorerText(fixture.goals, 'away')) && <div className="match-card-scorers" aria-label="Goalscorers">
        <span>{scorerText(fixture.goals, 'home')}</span>
        <Goal size={13} aria-hidden="true" />
        <span>{scorerText(fixture.goals, 'away')}</span>
      </div>}
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
      {canEdit && <span className="match-card-edit"><Pencil size={12} aria-hidden="true" /> Tap to edit</span>}
    </Card>
    </Link>
  )
}