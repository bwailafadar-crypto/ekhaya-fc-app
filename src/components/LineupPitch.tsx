import { Link } from 'react-router-dom'
import type { Player } from '../types'
import { arrangeFormation, isFormation } from '../utils/formations'

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

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

/** A player on the pitch: photo (or initials) with shirt number. Tap to open their profile. */
function PitchPlayer({ player }: { player: Player }) {
  return (
    <Link className="pitch-player" to={`/squad/${player.id}`} aria-label={`${player.name}${player.number != null ? `, number ${player.number}` : ''}. Open profile`}>
      <span className="pitch-shirt">
        {player.photoDataUrl ? <img src={player.photoDataUrl} alt="" /> : <span className="pitch-initials">{initials(player.name)}</span>}
        {player.number != null && <span className="pitch-number">{player.number}</span>}
      </span>
      <span className="pitch-name">{shortName(player.name)}</span>
    </Link>
  )
}

/**
 * Starting XI drawn on a pitch. With a formation (4-3-3, 4-4-2, …) the XI is
 * laid out in those lines; without one, players are grouped by their position.
 */
export default function LineupPitch({ starters, bench, formation }: { starters: Player[]; bench: Player[]; formation?: string | null }) {
  const useFormation = isFormation(formation) && starters.length >= 11
  // Attack at the top, goalkeeper at the bottom.
  const lines = useFormation ? arrangeFormation(starters, formation).reverse() : null
  const unplaced = useFormation ? [] : starters.filter((player) => !player.position)
  return (
    <div className="lineup">
      {useFormation && <p className="lineup-formation">Formation <strong>{formation}</strong></p>}
      <div className="pitch" role="group" aria-label={`Starting eleven${useFormation ? ` in a ${formation}` : ''}`}>
        <span className="pitch-line pitch-half" aria-hidden="true" />
        <span className="pitch-line pitch-circle" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-top" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-bottom" aria-hidden="true" />
        {lines
          ? lines.map((line, index) => line.length ? <div className="pitch-row" key={index}>{line.map((player) => <PitchPlayer key={player.id} player={player} />)}</div> : null)
          : ROWS.map((row) => {
            const rowPlayers = starters.filter((player) => player.position === row.key)
            return rowPlayers.length ? <div className="pitch-row" key={row.key}>{rowPlayers.map((player) => <PitchPlayer key={player.id} player={player} />)}</div> : null
          })}
      </div>
      <p className="lineup-tip">Tap a player to see their profile.</p>
      {unplaced.length > 0 && <div className="lineup-list"><h3>Also starting</h3><ul className="lineup-subs">{unplaced.map((player) => <li key={player.id}><Link to={`/squad/${player.id}`}>{player.number ? `${player.number}. ` : ''}{player.name}</Link></li>)}</ul></div>}
      {bench.length > 0 && <div className="lineup-list"><h3>Subs</h3><ul className="lineup-subs">{bench.map((player) => <li key={player.id}><em className="sub-tag">SUB</em><Link to={`/squad/${player.id}`}>{player.number ? `${player.number}. ` : ''}{player.name}</Link></li>)}</ul></div>}
    </div>
  )
}
