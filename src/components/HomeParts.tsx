// Pieces shared by the Home screens: latest live goal, confirmed XI, fans' man of the match.
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import LineupPitch from './LineupPitch'
import PlayerAvatar from './PlayerAvatar'
import { useMyDoc } from '../hooks/useCounts'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useLiveDocs } from '../hooks/useLiveDocs'
import type { Fixture, MatchEvent, Player } from '../types'

export function LatestGoal({ fixtureId }: { fixtureId: string }) {
  const events = useLiveDocs<Omit<MatchEvent, 'id'>>(['fixtures', fixtureId, 'events'])
  const goal = events.items.filter((event) => event.kind === 'goal').sort((a, b) => b.minute - a.minute)[0]
  // The scorer's photo (one small read, only when an Ekhaya player scored).
  const scorer = useMyDoc<Player>(goal?.playerId ? ['players', goal.playerId] : null).data
  if (!goal) return null
  const isClubGoal = /ekhaya/i.test(goal.team)
  return <span className={`home-live-goal${isClubGoal ? ' home-live-goal-club' : ''}`}>
    {scorer ? <PlayerAvatar player={{ ...scorer, id: goal.playerId ?? '' }} /> : <span className="home-live-goal-ball" aria-hidden="true">⚽</span>}
    <span><b>{isClubGoal ? 'GOAL!' : 'Goal'} {goal.minute}'</b> {goal.playerName || goal.team}</span>
  </span>
}

// Players (with photos) are only downloaded when a confirmed line-up is shown.
export function NextLineup({ fixture }: { fixture: Fixture }) {
  const players = useFirestoreCollection<Player>('players').items
  const pick = (ids: string[] | undefined) => (ids ?? []).map((id) => players.find((player) => player.id === id)).filter((player): player is Player => Boolean(player))
  const starters = pick(fixture.startingPlayerIds)
  if (!starters.length) return null
  return <details className="home-lineup" open><summary>Starting XI confirmed</summary><LineupPitch starters={starters} bench={pick(fixture.benchPlayerIds)} formation={fixture.formation} /></details>
}

// Fans' man of the match: the winner's photo once voting closes, a vote button while it is open.
export function MotmSpotlight({ fixture }: { fixture: Fixture }) {
  const [openedAt] = useState(() => Date.now())
  const winner = useMyDoc<Player>(fixture.motmClosed && fixture.motmWinnerId ? ['players', fixture.motmWinnerId] : null).data
  if (!/ekhaya/i.test(`${fixture.home} ${fixture.away}`) || fixture.editing) return null
  if (fixture.motmClosed) {
    if (!winner || !fixture.motmWinnerId) return null
    const share = fixture.motmWinnerVotes && fixture.motmTotalVotes ? Math.round(fixture.motmWinnerVotes / fixture.motmTotalVotes * 100) : null
    return <Link className="motm-spotlight" to={`/squad/${fixture.motmWinnerId}`}>
      <PlayerAvatar player={{ ...winner, id: fixture.motmWinnerId }} large />
      <span><small>★ Fans' man of the match</small><strong>{winner.name}{winner.number != null ? <em> #{winner.number}</em> : null}</strong>{share != null && <i>{share}% of the vote</i>}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  }
  // Only nudge fans to vote for a recent match (voting left open on an old one stays quiet).
  if (openedAt - new Date(fixture.date).getTime() > 4 * 86400000) return null
  return <Link className="motm-spotlight motm-spotlight-vote" to={`/live?match=${fixture.id}&tab=vote`}>
    <span className="motm-spotlight-star" aria-hidden="true">★</span>
    <span><small>Voting open</small><strong>Pick your man of the match</strong></span>
    <ArrowRight size={16} aria-hidden="true" />
  </Link>
}
