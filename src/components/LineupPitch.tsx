import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Player } from '../types'

/** What happened to a player in the match, from the commentary events. */
export type PlayerMarks = { off?: number; on?: number; replaced?: string; replacedBy?: string; goals?: number; assists?: number; yellow?: boolean; red?: boolean }
import { arrangeFormation, DEFAULT_FORMATION, FORMATIONS, isFormation, linesBySlot, slotRoles, type Formation } from '../utils/formations'

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
function PitchPlayer({ player, marks }: { player: Player; marks?: PlayerMarks }) {
  return (
    <Link className="pitch-player" to={`/squad/${player.id}`} aria-label={`${player.name}${player.number != null ? `, number ${player.number}` : ''}${marks?.off != null ? `, substituted ${marks.off} minutes` : ''}. Open profile`}>
      <span className="pitch-shirt">
        {player.photoDataUrl ? <img src={player.photoDataUrl} alt="" /> : <span className="pitch-initials">{initials(player.name)}</span>}
        {player.number != null && <span className="pitch-number">{player.number}</span>}
        {marks?.off != null && <span className="pitch-sub-off" title={`Off ${marks.off}′${marks.replacedBy ? ` for ${marks.replacedBy}` : ''}`}>↓{marks.off}′</span>}
        {(marks?.goals ?? 0) > 0 && <span className="pitch-goals" title={`${marks?.goals} goal${marks?.goals === 1 ? '' : 's'}`}>⚽{(marks?.goals ?? 0) > 1 ? marks?.goals : ''}</span>}
        {(marks?.assists ?? 0) > 0 && <span className="pitch-assists" title={`${marks?.assists} assist${marks?.assists === 1 ? '' : 's'}`} aria-label={`${marks?.assists} assist${marks?.assists === 1 ? '' : 's'}`}>👟{(marks?.assists ?? 0) > 1 ? marks?.assists : ''}</span>}
        {(marks?.red || marks?.yellow) && <span className={`pitch-card ${marks?.red ? 'red' : 'yellow'}`} aria-label={marks?.red ? 'Red card' : 'Yellow card'} />}
      </span>
      <span className="pitch-name">{shortName(player.name)}</span>
    </Link>
  )
}

/**
 * Starting XI drawn on a pitch. With a formation (4-3-3, 4-4-2, …) the XI is
 * laid out in those lines; without one, players are grouped by their position.
 */
export default function LineupPitch({ starters, bench, formation, onArrange, marks = {} }: { starters: Player[]; bench: Player[]; formation?: string | null; onArrange?: (order: string[], formation: Formation) => Promise<void>; marks?: Record<string, PlayerMarks> }) {
  const [arranging, setArranging] = useState(false)
  if (arranging && onArrange) return <ArrangePitch starters={starters} formation={formation} onSave={onArrange} onClose={() => setArranging(false)} />
  const useFormation = isFormation(formation) && starters.length >= 11
  // Attack at the top, goalkeeper at the bottom.
  // The XI is saved in team-sheet order (GK, defence, midfield, attack), so each
  // player appears exactly where the coach put them. Attack is drawn at the top.
  const lines = useFormation ? linesBySlot(starters, formation).reverse() : null
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
          ? lines.map((line, index) => line.length ? <div className="pitch-row" key={index}>{line.map((player) => <PitchPlayer key={player.id} player={player} marks={marks[player.id]} />)}</div> : null)
          : ROWS.map((row) => {
            const rowPlayers = starters.filter((player) => player.position === row.key)
            return rowPlayers.length ? <div className="pitch-row" key={row.key}>{rowPlayers.map((player) => <PitchPlayer key={player.id} player={player} marks={marks[player.id]} />)}</div> : null
          })}
      </div>
      <p className="lineup-tip">Tap a player to see their profile.</p>
      {onArrange && starters.length === 11 && <button type="button" className="lineup-arrange-open" onClick={() => setArranging(true)}>↔ Move players</button>}
      {unplaced.length > 0 && <div className="lineup-list"><h3>Also starting</h3><ul className="lineup-subs">{unplaced.map((player) => <li key={player.id}><Link to={`/squad/${player.id}`}>{player.number ? `${player.number}. ` : ''}{player.name}</Link></li>)}</ul></div>}
      {bench.length > 0 && <div className="lineup-list"><h3>Subs</h3><ul className="lineup-subs">{[...bench].sort((a, b) => (marks[a.id]?.on ?? 999) - (marks[b.id]?.on ?? 999)).map((player) => { const m = marks[player.id]; return <li key={player.id} className={`bench-player${m?.on != null ? ' came-on' : ''}`}><Link className="bench-face" to={`/squad/${player.id}`} aria-hidden="true" tabIndex={-1}>{player.photoDataUrl ? <img src={player.photoDataUrl} alt="" loading="lazy" /> : <span>{initials(player.name)}</span>}{player.number != null && <b>{player.number}</b>}</Link>{m?.on != null ? <em className="sub-tag on">↑ {m.on}′</em> : <em className="sub-tag">SUB</em>}<Link to={`/squad/${player.id}`}>{player.name}</Link>{m?.replaced && <small className="sub-for">for {m.replaced}</small>}{(m?.goals ?? 0) > 0 && <span className="sub-icons">⚽{(m?.goals ?? 0) > 1 ? m?.goals : ''}</span>}{(m?.assists ?? 0) > 0 && <span className="sub-icons" title="Assist">👟{(m?.assists ?? 0) > 1 ? m?.assists : ''}</span>}{(m?.red || m?.yellow) && <span className={`pitch-card inline ${m?.red ? 'red' : 'yellow'}`} />}{m?.off != null && <small className="sub-for">↓ {m.off}′</small>}</li> })}</ul></div>}
    </div>
  )
}

/** Admin: tap one player, then another, to swap their places; pick the formation; save. */
function ArrangePitch({ starters, formation, onSave, onClose }: { starters: Player[]; formation?: string | null; onSave: (order: string[], formation: Formation) => Promise<void>; onClose: () => void }) {
  const startFormation: Formation = isFormation(formation) ? formation : DEFAULT_FORMATION
  // Without a saved formation, start from the players' positions (GK, defence, midfield, attack).
  const [order, setOrder] = useState<Player[]>(() => isFormation(formation) ? starters : arrangeFormation(starters, startFormation).flat())
  const [shape, setShape] = useState<Formation>(startFormation)
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const roles = slotRoles(shape)
  const lines = linesBySlot(order.map((player, index) => ({ player, index })), shape).reverse()

  function tap(index: number) {
    if (picked === null) { setPicked(index); return }
    if (picked !== index) setOrder((current) => { const next = [...current]; [next[picked], next[index]] = [next[index], next[picked]]; return next })
    setPicked(null)
  }

  async function save() {
    setBusy(true)
    setError('')
    try { await onSave(order.map((player) => player.id), shape); onClose() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Not saved. Try again.') } finally { setBusy(false) }
  }

  return (
    <div className="lineup lineup-arranging">
      <div className="lineup-arrange-bar">
        <label>Formation <select value={shape} onChange={(event) => { setShape(event.target.value as Formation); setPicked(null) }}>{FORMATIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <span>{picked === null ? 'Tap a player to move' : `Now tap where ${shortName(order[picked].name)} should go`}</span>
      </div>
      <div className="pitch" role="group" aria-label="Move players">
        <span className="pitch-line pitch-half" aria-hidden="true" />
        <span className="pitch-line pitch-circle" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-top" aria-hidden="true" />
        <span className="pitch-line pitch-box pitch-box-bottom" aria-hidden="true" />
        {lines.map((line, row) => line.length ? <div className="pitch-row" key={row}>{line.map(({ player, index }) => (
          <button type="button" key={player.id} className={`pitch-player pitch-player-move${picked === index ? ' picked' : ''}`} aria-pressed={picked === index} onClick={() => tap(index)} aria-label={`${player.name}, ${roles[index]}`}>
            <span className="pitch-shirt">
              {player.photoDataUrl ? <img src={player.photoDataUrl} alt="" /> : <span className="pitch-initials">{initials(player.name)}</span>}
              {player.number != null && <span className="pitch-number">{player.number}</span>}
            </span>
            <span className="pitch-name">{shortName(player.name)}</span>
            <span className="pitch-role">{roles[index]}</span>
          </button>
        ))}</div> : null)}
      </div>
      {error && <p className="live-error" role="alert">{error}</p>}
      <div className="lineup-arrange-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save positions'}</button>
        <button type="button" className="button button-ghost" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
