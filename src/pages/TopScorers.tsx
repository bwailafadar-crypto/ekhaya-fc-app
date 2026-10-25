// Top scorers: the league's Golden Boot race and Ekhaya's own scorers and
// assists (worked out from the goals saved on each finished match).
import { Footprints, Goal, Trophy } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import PlayerAvatar from '../components/PlayerAvatar'
import TeamLogo from '../components/TeamLogo'
import { Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useMyDoc } from '../hooks/useCounts'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, Player } from '../types'
import { isCupCompetition } from '../utils/competitions'
import { formatMalawiDate } from '../utils/football'

type GoldenBoot = { asOf?: string; source?: string; players?: Array<{ name: string; club: string; goals: number }> }
type Row = { key: string; name: string; playerId?: string; goals: number; assists: number; penalties: number; matches: Set<string> }

const isClub = (name: string) => /ekhaya/i.test(name)
const norm = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

export default function TopScorers() {
  const { role } = useAuth()
  const open = useFlag('topScorers') || role === 'admin' || role === 'superadmin'
  const boot = useMyDoc<GoldenBoot>(['publicData', 'topScorers'])
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')
  const [scope, setScope] = useState<'league' | 'all'>('league')

  const finished = fixtures.items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest && (isClub(fixture.home) || isClub(fixture.away)) && (scope === 'all' || !isCupCompetition(fixture.competition)))
  const rows = new Map<string, Row>()
  const row = (name: string, playerId?: string) => {
    const key = playerId || norm(name)
    if (!rows.has(key)) rows.set(key, { key, name, playerId, goals: 0, assists: 0, penalties: 0, matches: new Set() })
    return rows.get(key) as Row
  }
  let clubGoals = 0
  for (const fixture of finished) {
    const side = isClub(fixture.home) ? 'home' : 'away'
    const score = Number(side === 'home' ? fixture.homeScore : fixture.awayScore) || 0
    const ours = (fixture.goals ?? []).filter((goal) => goal.side === side)
    clubGoals += score
    for (const goal of ours) {
      if (!goal.name) continue
      const scorer = row(goal.name, goal.playerId)
      scorer.goals += 1; scorer.matches.add(fixture.id)
      if (goal.penalty) scorer.penalties += 1
      if (goal.assist) row(goal.assist, goal.assistId).assists += 1
    }
  }
  const scorers = [...rows.values()].filter((item) => item.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name))
  const assisters = [...rows.values()].filter((item) => item.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals)
  const known = scorers.reduce((sum, item) => sum + item.goals, 0)
  const playerOf = (item: Row) => players.items.find((player) => player.id === item.playerId) ?? players.items.find((player) => norm(player.name) === norm(item.name))
  const bootPlayers = [...(boot.data?.players ?? [])].sort((a, b) => b.goals - a.goals)

  if (!open) return <><PageHeader eyebrow="2026 season" title="Top scorers" description="Coming soon" /><Card><EmptyState icon={Goal} title="Coming soon" description="The Golden Boot race and Ekhaya's scorers will be here soon." /></Card></>

  return <>
    <PageHeader eyebrow="2026 season" title="Top scorers" description="The league's Golden Boot race and Ekhaya's goals" />

    <Card className="scorers-card">
      <div className="scorers-head"><Trophy size={18} aria-hidden="true" /><div><h2>Golden Boot race</h2><span>FDH Bank Premiership{boot.data?.asOf ? ` · as of ${formatMalawiDate(boot.data.asOf)}` : ''}</span></div></div>
      {boot.loading ? <Skeleton /> : bootPlayers.length ? <ol className="scorers-list">
        {bootPlayers.map((item, index) => { const rank = bootPlayers.findIndex((other) => other.goals === item.goals) + 1; const ekhaya = isClub(item.club); return <li key={item.name} className={ekhaya ? 'ekhaya' : ''} style={{ animationDelay: `${index * 40}ms` }}>
          <b>{rank}</b><TeamLogo name={item.club} /><span><strong>{item.name}</strong><small>{item.club}</small></span><em>{item.goals}</em>
        </li> })}
      </ol> : <p className="scorers-note">The Golden Boot list will appear here.</p>}
      {boot.data?.source && <p className="scorers-note">Source: {boot.data.source}</p>}
    </Card>

    <Card className="scorers-card">
      <div className="scorers-head"><Goal size={18} aria-hidden="true" /><div><h2>Ekhaya FC scorers</h2><span>{known} of {clubGoals} goals with a known scorer</span></div></div>
      <div className="scorers-scope" role="group" aria-label="Which matches">
        <button type="button" className={scope === 'league' ? 'active' : ''} onClick={() => setScope('league')}>League</button>
        <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All matches (with cups)</button>
      </div>
      {scorers.length > 0 && <div className="scorers-ga-head" aria-hidden="true"><span>⚽ Goals</span><span>👟 Assists</span></div>}
      {fixtures.loading ? <Skeleton /> : scorers.length ? <ol className="scorers-list">
        {scorers.map((item, index) => { const player = playerOf(item); const rank = scorers.findIndex((other) => other.goals === item.goals) + 1; return <li key={item.key} style={{ animationDelay: `${index * 40}ms` }}>
          <b>{rank}</b>{player ? <PlayerAvatar player={player} /> : <span className="scorers-blank" />}
          <span>{player ? <Link to={`/squad/${player.id}`}><strong>{player.name}</strong></Link> : <strong>{item.name}</strong>}{item.penalties ? <small>{item.penalties} penalt{item.penalties === 1 ? 'y' : 'ies'}</small> : null}</span>
          <span className="scorers-ga"><em>{item.goals}</em><i>{item.assists}</i></span>
        </li> })}
      </ol> : <EmptyState icon={Goal} title="No scorers yet" description="Goals entered in the match centre appear here." />}
    </Card>

    {assisters.length > 0 && <Card className="scorers-card">
      <div className="scorers-head"><Footprints size={18} aria-hidden="true" /><div><h2>Ekhaya FC assists 👟</h2><span>{scope === 'league' ? 'League' : 'All matches'}</span></div></div>
      <ol className="scorers-list">{assisters.map((item) => { const player = playerOf(item); return <li key={item.key}>
        <b>{assisters.findIndex((other) => other.assists === item.assists) + 1}</b>{player ? <PlayerAvatar player={player} /> : <span className="scorers-blank" />}
        <span>{player ? <Link to={`/squad/${player.id}`}><strong>{player.name}</strong></Link> : <strong>{item.name}</strong>}<small>{item.goals ? `${item.goals} goal${item.goals === 1 ? '' : 's'} too` : ''}</small></span>
        <em>{item.assists}</em>
      </li> })}</ol>
      <p className="scorers-note">Assists count when they were recorded in the match centre or in match reports.</p>
    </Card>}
  </>
}

