import { Check, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Player } from '../types'
import PlayerAvatar from './PlayerAvatar'

const POSITIONS = ['All', 'GK', 'DEF', 'MID', 'FWD'] as const
type Pos = typeof POSITIONS[number]
const SORTS = [{ key: 'goals', label: 'Goals' }, { key: 'assists', label: 'Assists' }, { key: 'name', label: 'Name' }] as const
type SortKey = typeof SORTS[number]['key']

/** Full-screen player selector for the Matchday Hero pick (FPL-style). */
export default function HeroPicker({ players, currentPickId, matchLabel, saving, onPick, onClose }: {
  players: Player[]
  currentPickId?: string
  matchLabel: string
  saving: boolean
  onPick: (player: Player) => void
  onClose: () => void
}) {
  const [term, setTerm] = useState('')
  const [pos, setPos] = useState<Pos>('All')
  const [sort, setSort] = useState<SortKey>('goals')
  const [selected, setSelected] = useState(currentPickId ?? '')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const list = useMemo(() => {
    const q = term.trim().toLowerCase()
    return players
      .filter((player) => (pos === 'All' || player.position === pos) && (!q || player.name.toLowerCase().includes(q)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.stats?.[sort] ?? 0) - (a.stats?.[sort] ?? 0))
  }, [players, term, pos, sort])

  const chosen = players.find((player) => player.id === selected)

  return <div className="hp" role="dialog" aria-modal="true" aria-label="Pick your Matchday Hero">
    <header className="hp-head">
      <div className="hp-head-text"><h2>Pick your Matchday Hero</h2><span>{matchLabel}</span></div>
      <button type="button" className="hp-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
    </header>

    <div className="hp-controls">
      <label className="hp-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search players" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search players" /></label>
      <div className="hp-chips" role="tablist" aria-label="Position">
        {POSITIONS.map((option) => <button key={option} type="button" role="tab" aria-selected={pos === option} className={`hp-chip${pos === option ? ' on' : ''}`} onClick={() => setPos(option)}>{option}</button>)}
      </div>
      <div className="hp-sorts"><span>Sort</span>{SORTS.map((option) => <button key={option.key} type="button" className={`hp-sort${sort === option.key ? ' on' : ''}`} onClick={() => setSort(option.key)}>{option.label}</button>)}</div>
    </div>

    <div className="hp-listhead"><span>Player</span><span className="hp-stat">G</span><span className="hp-stat">A</span><span className="hp-stat">Apps</span></div>
    <div className="hp-list">
      {list.length === 0
        ? <p className="hp-empty">No players match that search.</p>
        : list.map((player) => <button key={player.id} type="button" className={`hp-row${selected === player.id ? ' on' : ''}`} aria-pressed={selected === player.id} onClick={() => setSelected(player.id)}>
            <span className="hp-main">
              <PlayerAvatar player={player} />
              <span className="hp-id"><span className="hp-name">{player.name}</span><span className="hp-meta">{player.position ?? 'Squad'}{player.number != null ? ` · #${player.number}` : ''}</span></span>
            </span>
            <span className="hp-stat">{player.stats?.goals ?? 0}</span>
            <span className="hp-stat">{player.stats?.assists ?? 0}</span>
            <span className="hp-stat">{player.stats?.appearances ?? 0}</span>
            {selected === player.id && <span className="hp-tick" aria-hidden="true"><Check size={15} /></span>}
          </button>)}
    </div>

    <div className="hp-foot">
      <button type="button" className="button button-primary hp-confirm" disabled={!chosen || saving} onClick={() => chosen && onPick(chosen)}>
        {saving ? 'Saving…' : chosen ? `Pick ${chosen.name}` : 'Select a player'}
      </button>
    </div>
  </div>
}
