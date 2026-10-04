import { Goal, Square, Star, Target } from 'lucide-react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import { useLiveDocs } from '../hooks/useLiveDocs'
import type { Fixture, MatchEvent, Player } from '../types'

function sameTeam(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Full-time summary: scorers, cards, fans' man of the match and prediction stats. */
export default function MatchSummary({ fixture, compact = false }: { fixture: Fixture; compact?: boolean }) {
  const events = useLiveDocs<Omit<MatchEvent, 'id'>>(['fixtures', fixture.id, 'events'])
  const home = fixture.homeScore ?? 0
  const away = fixture.awayScore ?? 0
  // Counted, not downloaded: about one read each however many fans predicted.
  const predictionsRef = collection(db, 'fixtures', fixture.id, 'predictions')
  const predictionCounts = useCounts(fixture.isTest ? null : `${fixture.id}:${home}-${away}`, () => ({ total: predictionsRef, exact: query(predictionsRef, where('home', '==', home), where('away', '==', away)) }))
  const byMinute = events.items.slice().sort((a, b) => a.minute - b.minute)
  const goals = byMinute.filter((event) => event.kind === 'goal')
  const cards = byMinute.filter((event) => event.kind === 'card')
  const sideGoals = (team: string) => goals.filter((event) => sameTeam(event.team, team))

  // The fans' man of the match is saved on the match when voting closes.
  // Only the winner's record is read (1 read), not the whole squad with photos.
  const leader = useMyDoc<Player>(fixture.motmClosed && fixture.motmWinnerId ? ['players', fixture.motmWinnerId] : null).data ?? undefined
  const leaderVotes = fixture.motmWinnerVotes
  const totalPredictions = predictionCounts.counts.total ?? 0
  const exact = predictionCounts.counts.exact ?? 0

  const goalLine = (event: Omit<MatchEvent, 'id'> & { id: string }) => <li key={event.id}><strong>{event.minute}'</strong> {event.playerName || 'Goal'}{event.assistPlayerName && !compact ? <small> (assist {event.assistPlayerName})</small> : null}</li>

  return (
    <section className={`match-summary${compact ? ' match-summary-compact' : ''}`} aria-label="Full-time summary">
      <div className="match-summary-head">
        <span className="page-eyebrow">Full time{fixture.round ? ` · ${fixture.competition} ${fixture.round}` : ''}</span>
        <h2>{fixture.home} <em>{home}–{away}</em> {fixture.away}</h2>
      </div>
      {goals.length > 0 ? <div className="match-summary-goals">
        <div><span className="match-summary-team">{fixture.home}</span><ul>{sideGoals(fixture.home).map(goalLine)}</ul></div>
        <Goal size={16} aria-hidden="true" />
        <div><span className="match-summary-team">{fixture.away}</span><ul>{sideGoals(fixture.away).map(goalLine)}</ul></div>
      </div> : !events.loading && !fixture.note && <p className="match-summary-note">{home + away === 0 ? 'A goalless draw.' : 'Goal details were not recorded for this match.'}</p>}
      {fixture.note && <p className="match-summary-note">{fixture.note}</p>}
      {!compact && cards.length > 0 && <ul className="match-summary-cards">{cards.map((event) => <li key={event.id}><Square size={12} className={event.card === 'red' ? 'card-red' : 'card-yellow'} aria-label={`${event.card === 'red' ? 'Red' : 'Yellow'} card`} /> {event.minute}' {event.playerName || event.team}</li>)}</ul>}
      {!fixture.isTest && (leader || totalPredictions > 0) && <div className="match-summary-extras">
        {leader && <span><Star size={14} aria-hidden="true" /> Fans' man of the match: <strong>{leader.name}</strong>{leaderVotes ? ` (${leaderVotes} vote${leaderVotes === 1 ? '' : 's'})` : ''}</span>}
        {totalPredictions > 0 && <span><Target size={14} aria-hidden="true" /> {exact} of {totalPredictions} fans predicted {home}–{away}</span>}
      </div>}
    </section>
  )
}
