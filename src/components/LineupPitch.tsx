import type { Player } from '../types'

const ROWS: Array<{ key: NonNullable<Player['position']>; label: string }> = [
  { key: 'FWD', label: 'Forwards' },
  { key: 'MID', label: 'Midfield' },
  { key: 'DEF', label: 'Defence' },
  { key: 'GK', label: 'Goalkeeper' },
]

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

function PitchPlayer({ player }: { player: Player }) {
  return (
    <div className="pitch-player">
      <span className="pitch-shirt">{player.number ?? ''}</span>
      <span className="pitch-name">{shortName(player.name)}</span>
    </div>
  )
}

/**
 * Starting XI drawn on a pitch by position. Players without a position are
 * listed under the pitch, so the layout still works while profiles are incomplete.
 */
export default function LineupPitch({ starters, bench }: { starters: Player[]; bench: Player[] }) {
  const unplaced = starters.filter((player) => !player.position)
  return (
    <div className="lineup">
      <div className="pitch" role="img" aria-label={`Starting eleven: ${starters.map((player) => player.name).join(', ')}`}>
        <span className="pitch-line pitch-half" aria-hidden="true" />
        <span className="pitch-line pitch-circle" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-top" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-bottom" aria-hidden="true" />
        {ROWS.map((row) => {
          const rowPlayers = starters.filter((player) => player.position === row.key)
          return rowPlayers.length ? <div className="pitch-row" key={row.key}>{rowPlayers.map((player) => <PitchPlayer key={player.id} player={player} />)}</div> : null
        })}
      </div>
      {unplaced.length > 0 && <div className="lineup-list"><h3>Also starting</h3><p>{unplaced.map((player) => `${player.number ? `${player.number}. ` : ''}${player.name}`).join(' · ')}</p></div>}
      {bench.length > 0 && <div className="lineup-list"><h3>Substitutes</h3><p>{bench.map((player) => `${player.number ? `${player.number}. ` : ''}${player.name}`).join(' · ')}</p></div>}
    </div>
  )
}
