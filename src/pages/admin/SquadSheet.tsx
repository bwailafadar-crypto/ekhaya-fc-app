import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { Camera, Check, ClipboardList, ClipboardPaste } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import PlayerAvatar from '../../components/PlayerAvatar'
import { useToast } from '../../components/ToastContext'
import { Card } from '../../components/UI'
import { db } from '../../firebase'
import { inSquad, type Squad } from '../../hooks/useSquad'
import type { Player } from '../../types'
import { compressImage, IMAGE_SIZES } from '../../utils/compressImage'

const TODAY = new Date().toISOString().slice(0, 10)
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
type Editable = 'photoDataUrl' | 'number' | 'position' | 'dob'

const norm = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '')
const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const EMPTY_STATS = { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, cleanSheets: 0 }

function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = saved
    }
  }
  return row[b.length]
}

type PastedRow = { name: string; dob: string | null; number: number | null; match?: Player }

/** Reads lines like "12 Clever Mkungula 13/02/2000" (number and date optional, day/month/year). */
function parseSquad(text: string, players: Player[]): PastedRow[] {
  const rows: PastedRow[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, ' ').trim()
    if (!line) continue
    const date = line.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
    let dob: string | null = null
    if (date) {
      const [, d, m, y] = date.map(Number)
      if (y > 1950 && y <= new Date().getFullYear() - 10 && m >= 1 && m <= 12 && d >= 1 && d <= 31) dob = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    const rest = (date ? line.replace(date[0], ' ') : line).replace(/\b\d{1,3}\s*(years?|yrs?)?\s*$/i, ' ')
    const lead = rest.match(/^\s*(\d{1,2})[.)\s]+/)
    const name = rest.replace(/^\s*\d{1,3}[.)\s]+/, '').replace(/\s+/g, ' ').trim().replace(/\b\w+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    if (name.length < 3 || /^(no|names?|d\.?o\.?b|age)/i.test(name)) continue
    // Match by name; small spelling differences ("Josephy" / "Joseph", "MacDonald" / "McDonald",
    // "Helmas" / "Hermas") still match when exactly one player is that close.
    const key = norm(name)
    const close = players.map((player) => ({ player, distance: editDistance(norm(player.name), key) })).filter((item) => item.distance <= 2).sort((a, b) => a.distance - b.distance)
    const match = close[0] && (close.length === 1 || close[0].distance < close[1].distance) ? close[0].player : undefined
    rows.push({ name, dob, number: lead ? Number(lead[1]) : null, match })
  }
  return rows
}

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
  const [pasteText, setPasteText] = useState('')
  const [pasted, setPasted] = useState<PastedRow[] | null>(null)
  const [pasteBusy, setPasteBusy] = useState(false)
  const [side, setSide] = useState<Squad>('men')
  const squad = players.filter((player) => inSquad(player.squad, side)).sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name))
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

  async function savePasted() {
    if (!pasted) return
    setPasteBusy(true)
    try {
      const batch = writeBatch(db)
      const taken = new Set(players.map((player) => player.id))
      let updates = 0
      let added = 0
      for (const row of pasted) {
        if (row.match) {
          if (row.dob && row.dob !== row.match.dob) { batch.update(doc(db, 'players', row.match.id), { dob: row.dob, updatedAt: serverTimestamp() }); updates++ }
          continue
        }
        let id = slug(row.name)
        for (let n = 2; taken.has(id); n += 1) id = `${slug(row.name)}-${n}`
        taken.add(id)
        batch.set(doc(db, 'players', id), { name: row.name, number: null, team: side === 'men' ? 'senior' : 'women', squad: side, position: null, dob: row.dob, nationality: 'Malawian', preferredFoot: null, heightCm: null, photoDataUrl: null, stats: { ...EMPTY_STATS }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        added++
      }
      if (updates + added) await batch.commit()
      showToast(`${updates} date${updates === 1 ? '' : 's'} of birth saved${added ? `, ${added} new player${added === 1 ? '' : 's'} added` : ''}.`)
      setPasted(null)
      setPasteText('')
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error')
    } finally { setPasteBusy(false) }
  }

  const tick = (player: Player, field: Editable) => saving === `${player.id}:${field}` ? <span className="sq-status">Saving…</span> : saved === `${player.id}:${field}` ? <span className="sq-status sq-ok"><Check size={12} /> Saved</span> : null

  return <Card className="admin-card squad-sheet">
    <div className="sq-head">
      <ClipboardList size={18} aria-hidden="true" />
      <div><h2>Squad sheet</h2><span>{incomplete.length ? `${incomplete.length} of ${squad.length} players need details` : `All ${squad.length} players complete`}</span></div>
    </div>
    <div className="sq-side" role="group" aria-label="Which team">
      <button type="button" className={side === 'men' ? 'active' : ''} aria-pressed={side === 'men'} onClick={() => { setSide('men'); setPasted(null) }}>Men</button>
      <button type="button" className={side === 'women' ? 'active' : ''} aria-pressed={side === 'women'} onClick={() => { setSide('women'); setPasted(null) }}>Women</button>
    </div>
    <details className="sq-paste"><summary><ClipboardPaste size={15} aria-hidden="true" /> Paste a squad list (names and dates of birth)</summary>
      <textarea rows={6} value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPasted(null) }} placeholder={'Andrew Lameck 25/12/2004\nClever Mkungula 13/02/2000\nLucky Tizitola 25/03/2003'} />
      <button type="button" className="sq-paste-check" onClick={() => setPasted(parseSquad(pasteText, squad))}>Check the list</button>
      {pasted && <div className="sq-paste-preview">
        <ul>{pasted.map((row, index) => <li key={index} className={row.match ? '' : 'new'}>
          <span>{row.match ? row.match.name : `+ ${row.name} (new player)`}</span>
          <small>{row.dob ? `born ${row.dob.split('-').reverse().join('/')}` : 'no date'}{row.match?.dob && row.dob && row.match.dob !== row.dob ? ` (was ${row.match.dob.split('-').reverse().join('/')})` : ''}{row.match && row.match.name !== row.name ? ` · sheet: ${row.name}` : ''}</small>
        </li>)}</ul>
        <p className="live-help">Matched players get their date of birth. Names not in the squad are added as new players (no number or position yet). Check the new ones: a spelling difference adds a second player.</p>
        <button type="button" className="sq-paste-save" disabled={pasteBusy || !pasted.length} onClick={() => void savePasted()}>{pasteBusy ? 'Saving…' : `Save ${pasted.length} line${pasted.length === 1 ? '' : 's'}`}</button>
      </div>}
    </details>
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
