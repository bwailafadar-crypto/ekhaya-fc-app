import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Camera, Check, ClipboardList } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import PlayerAvatar from '../../components/PlayerAvatar'
import { useToast } from '../../components/ToastContext'
import { Card } from '../../components/UI'
import { db } from '../../firebase'
import type { Player } from '../../types'
import { compressImage, IMAGE_SIZES } from '../../utils/compressImage'

const TODAY = new Date().toISOString().slice(0, 10)
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
type Editable = 'photoDataUrl' | 'number' | 'position' | 'dob'

function missing(player: Player) {
  return [!player.photoDataUrl && 'photo', !player.position && 'position', player.number == null && 'number', !player.dob && 'date of birth'].filter(Boolean) as string[]
}

/**
 * Quick squad sheet: fill in photos, shirt numbers, positions and dates of
 * birth for the whole squad on one screen. Every change saves straight away.
 */
export default function SquadSheet({ players }: { players: Player[] }) {
  const { showToast } = useToast()
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [saving, setSaving] = useState('')
  const [saved, setSaved] = useState('')
  const squad = players.filter((player) => player.team === 'senior').sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name))
  const incomplete = squad.filter((player) => missing(player).length)
  const shown = onlyMissing ? incomplete : squad
  const count = (field: string) => squad.filter((player) => missing(player).includes(field)).length

  async function save(player: Player, field: Editable, value: string | number | null) {
    const key = `${player.id}:${field}`
    setSaving(key)
    try {
      await updateDoc(doc(db, 'players', player.id), { [field]: value, updatedAt: serverTimestamp() })
      setSaved(key)
      window.setTimeout(() => setSaved((current) => (current === key ? '' : current)), 1600)
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved. Check your connection.', 'error')
    } finally {
      setSaving('')
    }
  }

  async function photo(player: Player, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      await save(player, 'photoDataUrl', await compressImage(file, IMAGE_SIZES.player))
      showToast(`Photo saved for ${player.name}.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'This photo could not be used.', 'error')
    }
  }

  const tick = (player: Player, field: Editable) => saving === `${player.id}:${field}` ? <span className="sq-status">Saving…</span> : saved === `${player.id}:${field}` ? <span className="sq-status sq-ok"><Check size={12} /> Saved</span> : null

  return <Card className="admin-card squad-sheet">
    <div className="sq-head">
      <ClipboardList size={18} aria-hidden="true" />
      <div><h2>Squad sheet</h2><span>{incomplete.length ? `${incomplete.length} of ${squad.length} players need details` : `All ${squad.length} players complete`}</span></div>
    </div>
    {squad.length > 0 && <p className="sq-missing">Missing: {count('photo')} photos · {count('position')} positions · {count('number')} numbers · {count('date of birth')} dates of birth</p>}
    <div className="sq-filter" role="group" aria-label="Which players to show">
      <button type="button" className={onlyMissing ? 'active' : ''} onClick={() => setOnlyMissing(true)}>Needs details ({incomplete.length})</button>
      <button type="button" className={!onlyMissing ? 'active' : ''} onClick={() => setOnlyMissing(false)}>Whole squad ({squad.length})</button>
    </div>
    {!shown.length && <p className="sq-done">Every player has a photo, number, position and date of birth. 🎉</p>}
    <ul className="sq-list">
      {shown.map((player) => <li key={player.id} className="sq-row">
        <label className="sq-photo" title="Take or choose a photo" aria-label={`Photo for ${player.name}`}>
          <input type="file" accept="image/*" onChange={(event) => void photo(player, event)} />
          <PlayerAvatar player={player} />
          <span className="sq-camera" aria-hidden="true"><Camera size={12} /></span>
        </label>
        <div className="sq-main">
          <strong>{player.name}</strong>
          <div className="sq-pos" role="group" aria-label={`Position for ${player.name}`}>
            {POSITIONS.map((pos) => <button key={pos} type="button" className={player.position === pos ? 'active' : ''} aria-pressed={player.position === pos} disabled={Boolean(saving)} onClick={() => void save(player, 'position', player.position === pos ? null : pos)}>{pos}</button>)}
            {tick(player, 'position')}
          </div>
          <div className="sq-fields">
            <label><span>No.</span><input type="number" inputMode="numeric" min={1} max={99} defaultValue={player.number ?? ''} key={`n-${player.number}`} onBlur={(event) => { const raw = event.currentTarget.value.trim(); const value = raw ? Math.max(1, Math.min(99, Math.round(Number(raw)))) : null; if (value !== player.number && (raw === '' || Number.isFinite(value))) void save(player, 'number', value) }} /></label>
            <label><span>Born</span><input type="date" max={TODAY} defaultValue={player.dob ?? ''} key={`d-${player.dob}`} onChange={(event) => { const value = event.currentTarget.value || null; if (value !== player.dob) void save(player, 'dob', value) }} /></label>
            {tick(player, 'number') ?? tick(player, 'dob') ?? tick(player, 'photoDataUrl')}
          </div>
          {missing(player).length > 0 && <small className="sq-need">Needs: {missing(player).join(', ')}</small>}
        </div>
      </li>)}
    </ul>
  </Card>
}
