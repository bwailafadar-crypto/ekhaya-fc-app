import { Goal, Square, Star, Target } from 'lucide-react'
import { useLiveDocs } from '../hooks/useLiveDocs'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, MatchEvent, MotmVote, Player, ScorePrediction } from '../types'

function sameTeam(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Full-time summary: scorers, cards, fans' man of the match and prediction stats. */
export default function MatchSummary({ fixture, compact = false }: { fixture: Fixture; compact?: boolean }) {
  const events = useLiveDocs<Omit<MatchEvent, 'id'>>(['fixtures', fixture.id, 'events'])
  const motm = useLiveDocs<Omit<MotmVote, 'id'>>(fixture.isTest ? null : ['fixtures', fixture.id, 'motm'])
  const predictions = useLiveDocs<Omit<ScorePrediction, 'id'>>(fixture.isTest ? null : ['fixtures', fixture.id, 'predictions'])
  const players = useFirestoreCollection<Player>('players')
  const home = fixture.homeScore ?? 0
  const away = fixture.awayScore ?? 0
  const byMinute = events.items.slice().sort((a, b) => a.minute - b.minute)
  const goals = byMinute.filter((event) => event.kind === 'goal')
  const cards = byMinute.filter((event) => event.kind === 'card')
  const sideGoals = (team: string) => goals.filter((event) => sameTeam(event.team, team))

  const tally = new Map<string, number>()
  motm.items.forEach((vote) => tally.set(vote.playerId, (tally.get(vote.playerId) ?? 0) + 1))
  const [leaderId, leaderVotes] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  const leader = leaderId ? players.items.find((player) => player.id === leaderId) : undefined
  const exact = predictions.items.filter((item) => item.home === home && item.away === away).length

  const goalLine = (event: Omit<MatchEvent, 'id'> & { id: string }) => <li key={event.id}><strong>{event.minute}'</strong> {event.playerName || 'Goal'}{event.assistPlayerName && !compact ? <small> (assist {event.assistPlayerName})</small> : null}</li>

  return (
    <section className={`match-summary${compact ? ' match-summary-compact' : ''}`} aria-label="Full-time summary">
      <div className="match-summary-head">
        <span className="page-eyebrow">Full time</span>
        <h2>{fixture.home} <em>{home}–{away}</em> {fixture.away}</h2>
      </div>
      {goals.length > 0 ? <div className="match-summary-goals">
        <div><span className="match-summary-team">{fixture.home}</span><ul>{sideGoals(fixture.home).map(goalLine)}</ul></div>
        <Goal size={16} aria-hidden="true" />
        <div><span className="match-summary-team">{fixture.away}</span><ul>{sideGoals(fixture.away).map(goalLine)}</ul></div>
      </div> : !events.loading && <p className="match-summary-note">{home + away === 0 ? 'A goalless draw.' : 'Goal details were not recorded for this match.'}</p>}
      {!compact && cards.length > 0 && <ul className="match-summary-cards">{cards.map((event) => <li key={event.id}><Square size={12} className={event.card === 'red' ? 'card-red' : 'card-yellow'} aria-label={`${event.card === 'red' ? 'Red' : 'Yellow'} card`} /> {event.minute}' {event.playerName || event.team}</li>)}</ul>}
      {!fixture.isTest && (leader || predictions.items.length > 0) && <div className="match-summary-extras">
        {leader && <span><Star size={14} aria-hidden="true" /> {fixture.motmClosed ? "Fans' man of the match" : 'Leading MOTM vote'}: <strong>{leader.name}</strong>{leaderVotes ? ` (${leaderVotes} vote${leaderVotes === 1 ? '' : 's'})` : ''}</span>}
        {predictions.items.length > 0 && <span><Target size={14} aria-hidden="true" /> {exact} of {predictions.items.length} fans predicted {home}–{away}</span>}
      </div>}
    </section>
  )
}
