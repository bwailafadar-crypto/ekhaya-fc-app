// Catapult GPS for one match: team averages and the top runners.
// Fans see distance, high-speed and sprint distance; staff also see player
// load and acceleration figures.
import { Activity } from 'lucide-react'
import { useState } from 'react'
import type { MatchGps, Player } from '../types'

import { km } from '../utils/gps'
const SORTS = {
  distance: 'Distance',
  highSpeedDistance: 'High speed',
  sprintDistance: 'Sprint',
  playerLoad: 'Player load',
} as const
type SortKey = keyof typeof SORTS

export default function MatchGpsCard({ gps, players, staff, officialMinutes }: { gps: MatchGps; players: Player[]; staff: boolean; officialMinutes?: Record<string, number> }) {
  const [sort, setSort] = useState<SortKey>('distance')
  const [showAll, setShowAll] = useState(false)
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  // Only players who actually played (the GPS also covers unused subs' warm-up).
  const played = gps.players.filter((p) => !officialMinutes || (officialMinutes[p.playerId] ?? 0) > 0)
  const rows = [...played].sort((a, b) => Number(b[sort]) - Number(a[sort]))
  const shown = showAll ? rows : rows.slice(0, 5)
  const sortKeys = (Object.keys(SORTS) as SortKey[]).filter((key) => staff || key !== 'playerLoad')
  const top = rows[0]
  const teamDistance = played.reduce((sum, p) => sum + p.distance, 0)

  return <section className="gps-card" aria-label="GPS data">
    <div className="matchday-section-title"><h2><Activity size={18} aria-hidden="true" /> GPS data</h2><span>{gps.device}</span></div>
    <div className="gps-tiles">
      <div><strong>{km(teamDistance)}</strong><span>Team distance</span></div>
      <div><strong>{km(gps.team.averageDistance)}</strong><span>Average per player</span></div>
      <div><strong>{Math.round(gps.team.averageHighSpeedDistance)} m</strong><span>Avg high speed</span></div>
      {staff && <div><strong>{Math.round(gps.team.averagePlayerLoad)}</strong><span>Avg player load</span></div>}
    </div>
    {top && sort === 'distance' && <p className="gps-top">🏃 <strong>{nameOf(top.playerId)}</strong> covered the most ground: {km(top.distance)}.</p>}
    <div className="gps-sort" role="group" aria-label="Sort by">{sortKeys.map((key) => <button type="button" key={key} className={sort === key ? 'active' : ''} onClick={() => setSort(key)}>{SORTS[key]}</button>)}</div>
    <ol className="gps-list">
      {shown.map((p, index) => {
        const value = Number(p[sort])
        const max = Math.max(1, Number(rows[0]?.[sort] ?? 1))
        return <li key={p.playerId}>
          <span className="gps-rank">{index + 1}</span>
          <span className="gps-name">{nameOf(p.playerId)}<small>{p.position}{officialMinutes?.[p.playerId] ? ` · ${officialMinutes[p.playerId]}′` : ''}</small></span>
          <span className="gps-bar"><i style={{ width: `${(value / max) * 100}%` }} /></span>
          <strong>{sort === 'distance' ? km(value) : sort === 'playerLoad' ? value : `${value} m`}</strong>
          {staff && showAll && <small className="gps-extra">Acc {p.maxAccel} · Dec {p.maxDecel} · A+D {p.accelDecelEfforts}</small>}
        </li>
      })}
    </ol>
    {rows.length > 5 && <button type="button" className="gps-more" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show top 5' : `Show all ${rows.length} players`}</button>}
  </section>
}
