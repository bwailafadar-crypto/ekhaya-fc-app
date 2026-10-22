// The whole league table on one screen: type this week's numbers (or paste the
// official table), check them, preview the new order and save. Replaces the
// `npm run table` terminal step.
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { ClipboardPaste, Save, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import TeamLogo from '../../components/TeamLogo'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import type { Standing } from '../../types'

type Result = 'W' | 'D' | 'L'
type Row = { id: string; team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; form: Result[]; oldPosition: number; formTouched: boolean }
const NUMS = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'] as const
type NumKey = (typeof NUMS)[number]
const LABEL: Record<NumKey, string> = { played: 'P', won: 'W', drawn: 'D', lost: 'L', goalsFor: 'GF', goalsAgainst: 'GA', points: 'Pts' }

const norm = (name: string) => name.toLowerCase().replace(/\b(fc|f\.c|sc|united|utd|football club)\b/g, '').replace(/[^a-z]/g, '')

function fromStanding(row: Standing): Row {
  return { id: row.id, team: row.team, played: row.played ?? 0, won: row.won ?? 0, drawn: row.drawn ?? 0, lost: row.lost ?? 0, goalsFor: row.goalsFor ?? 0, goalsAgainst: row.goalsAgainst ?? 0, points: row.points ?? 0, form: row.form ?? [], oldPosition: row.position ?? 0, formTouched: false }
}

/** Official order: points, then goal difference, then goals scored. */
function ranked(rows: Row[]) {
  return [...rows].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team))
}

/** This week's result, worked out from the numbers when exactly one game was added. */
function newResult(row: Row, saved: Standing | undefined): Result | null {
  if (!saved || row.played !== (saved.played ?? 0) + 1) return null
  if (row.won === (saved.won ?? 0) + 1) return 'W'
  if (row.drawn === (saved.drawn ?? 0) + 1) return 'D'
  if (row.lost === (saved.lost ?? 0) + 1) return 'L'
  return null
}

/**
 * Reads a pasted table: each line has a team name followed by its numbers,
 * e.g. "1. FCB NYASA BIG BULLETS 17 10 6 1 25 7 18 36" (P W D L GF GA GD Pts).
 */
function parsePasted(text: string, rows: Row[]) {
  const updates = new Map<string, Partial<Row>>()
  const unknown: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, ' ').trim()
    const numbers = line.match(/-?\d+/g)?.map(Number) ?? []
    const name = line.replace(/^\s*\d+\s*[.)]?\s*/, '').replace(/[-\d\s]+$/, '').trim()
    if (!name || numbers.length < 7) continue
    const tail = numbers.slice(-8)
    const [played, won, drawn, lost, goalsFor, goalsAgainst, , points] = tail.length === 8 ? tail : [...tail.slice(0, 6), 0, tail[6]]
    const key = norm(name)
    const match = rows.find((row) => norm(row.team) === key) ?? rows.find((row) => norm(row.team).includes(key) || key.includes(norm(row.team)))
    if (!match) { unknown.push(name); continue }
    updates.set(match.id, { played, won, drawn, lost, goalsFor, goalsAgainst, points })
  }
  return { updates, unknown }
}

export default function TableEditor({ standings }: { standings: Standing[] }) {
  const { showToast } = useToast()
  const saved = useMemo(() => new Map(standings.map((row) => [row.id, row])), [standings])
  const [rows, setRows] = useState<Row[]>(() => [...standings].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(fromStanding))
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)

  const order = ranked(rows)
  const totalGF = rows.reduce((sum, row) => sum + row.goalsFor, 0)
  const totalGA = rows.reduce((sum, row) => sum + row.goalsAgainst, 0)
  const totalW = rows.reduce((sum, row) => sum + row.won, 0)
  const totalL = rows.reduce((sum, row) => sum + row.lost, 0)
  const rowProblems = (row: Row) => [
    row.won + row.drawn + row.lost !== row.played && `W+D+L is ${row.won + row.drawn + row.lost}, not ${row.played}`,
    row.won * 3 + row.drawn !== row.points && `points should be ${row.won * 3 + row.drawn}`,
  ].filter(Boolean) as string[]
  const problems = rows.flatMap((row) => rowProblems(row).map((text) => `${row.team}: ${text}`))
  if (totalGF !== totalGA) problems.push(`All goals scored (${totalGF}) must equal all goals conceded (${totalGA}).`)
  if (totalW !== totalL) problems.push(`All wins (${totalW}) must equal all losses (${totalL}).`)
  const changed = rows.filter((row) => {
    const s = saved.get(row.id)
    return !s || NUMS.some((key) => (s[key] ?? 0) !== row[key]) || row.formTouched || newResult(row, s)
  })

  function edit(id: string, key: NumKey, value: string) {
    const n = Math.max(key === 'goalsFor' || key === 'goalsAgainst' || key === 'points' ? 0 : 0, Number.parseInt(value || '0', 10) || 0)
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: n } : row)))
  }
  function editForm(id: string, value: string) {
    const form = value.toUpperCase().split('').filter((c): c is Result => c === 'W' || c === 'D' || c === 'L').slice(-5)
    setRows((current) => current.map((row) => (row.id === id ? { ...row, form, formTouched: true } : row)))
  }
  function applyPaste() {
    const { updates, unknown } = parsePasted(paste, rows)
    if (!updates.size) { showToast('No table lines found. Each line needs the team and its numbers: P W D L GF GA GD Pts.', 'error'); return }
    setRows((current) => current.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row)))
    showToast(`${updates.size} team(s) filled in from the pasted table.${unknown.length ? ` Not matched: ${unknown.join(', ')}` : ''}`, unknown.length ? 'error' : 'success')
  }

  async function save() {
    if (problems.length && !window.confirm(`The table has ${problems.length} problem(s):\n\n${problems.slice(0, 6).join('\n')}\n\nSave anyway?`)) return
    setBusy(true)
    try {
      const batch = writeBatch(db)
      order.forEach((row, index) => {
        const s = saved.get(row.id)
        const result = row.formTouched ? null : newResult(row, s)
        const form = result ? [...row.form, result].slice(-5) : row.form
        batch.set(doc(db, 'standings', row.id), {
          id: row.id, team: row.team, position: index + 1, previousPosition: row.oldPosition || index + 1,
          played: row.played, won: row.won, drawn: row.drawn, lost: row.lost, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalsFor - row.goalsAgainst, points: row.points, form, updatedAt: serverTimestamp(),
        }, { merge: true })
      })
      await batch.commit()
      showToast('League table saved. Fans see it now.')
      setRows(order.map((row, index) => ({ ...row, oldPosition: index + 1, formTouched: false, form: row.formTouched ? row.form : (() => { const r = newResult(row, saved.get(row.id)); return r ? [...row.form, r].slice(-5) : row.form })() })))
    } catch (error) {
      showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error')
    } finally { setBusy(false) }
  }

  return <Card className="admin-card table-editor">
    <div className="fz-card-heading"><Table2 size={18} aria-hidden="true" /><div><h2>Update the whole table</h2><span>Type this week's numbers or paste the official table, check, then save</span></div></div>
    <details className="table-paste"><summary><ClipboardPaste size={15} aria-hidden="true" /> Paste the official table</summary>
      <textarea rows={6} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'1. FCB NYASA BIG BULLETS 17 10 6 1 25 7 18 36\n2. MIGHTY WANDERERS FC 17 10 5 2 29 11 18 35\n…'} />
      <Button type="button" variant="secondary" onClick={applyPaste}>Fill in the table</Button>
    </details>
    <div className="table-editor-scroll">
      <table>
        <thead><tr><th>New</th><th className="te-team">Team</th>{NUMS.map((key) => <th key={key}>{LABEL[key]}</th>)}<th>GD</th><th>Form</th></tr></thead>
        <tbody>{order.map((row, index) => {
          const s = saved.get(row.id)
          const move = row.oldPosition ? row.oldPosition - (index + 1) : 0
          const bad = rowProblems(row).length > 0
          const result = row.formTouched ? null : newResult(row, s)
          return <tr key={row.id} className={bad ? 'te-bad' : changed.includes(row) ? 'te-changed' : ''}>
            <td className="te-pos">{index + 1}{move > 0 ? <i className="pos-up">▲</i> : move < 0 ? <i className="pos-down">▼</i> : null}</td>
            <td className="te-team"><TeamLogo name={row.team} /><span>{row.team}</span></td>
            {NUMS.map((key) => <td key={key}><input inputMode="numeric" aria-label={`${row.team} ${LABEL[key]}`} value={row[key]} onChange={(event) => edit(row.id, key, event.target.value)} onFocus={(event) => event.target.select()} /></td>)}
            <td className="te-gd">{row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}{row.goalsFor - row.goalsAgainst}</td>
            <td><input className="te-form" aria-label={`${row.team} form`} value={(result ? [...row.form, result].slice(-5) : row.form).join('')} onChange={(event) => editForm(row.id, event.target.value)} /></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <p className="live-help">Order is worked out by points, goal difference, then goals scored. When a team's games go up by one, this week's result is added to its form by itself (newest on the right).</p>
    {problems.length > 0 ? <ul className="te-problems">{problems.slice(0, 8).map((text) => <li key={text}>⚠ {text}</li>)}</ul> : <p className="te-ok">✔ Everything adds up: {totalGF} goals scored and conceded, {totalW} wins and losses.</p>}
    <div className="admin-actions">
      <Button type="button" disabled={busy || !changed.length} icon={<Save size={16} />} onClick={() => void save()}>{busy ? 'Saving…' : changed.length ? `Save table (${changed.length} team${changed.length === 1 ? '' : 's'} changed)` : 'No changes'}</Button>
      {changed.length > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => setRows([...standings].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(fromStanding))}>Undo changes</Button>}
    </div>
  </Card>
}
