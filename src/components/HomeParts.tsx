// Pieces shared by the Home screens: latest live goal and the confirmed XI.
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
