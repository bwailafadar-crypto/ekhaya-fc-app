// Form tracking from real results. The table (P, W, D, L, goals, points and
// the last-5 form with the match behind each letter) is checked against every
// league result: the official results to week 17, results added here each
// week, and Ekhaya's own matches from the match centre.
import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { CheckCircle2, ListChecks, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import { NEXT_FIXTURES, OFFICIAL_RESULTS, type LeagueFixture, type LeagueResult } from '../../data/leagueResults2026'
import type { Fixture, Standing } from '../../types'
import { isCupCompetition } from '../../utils/competitions'
import { computeTable, norm, parseResults, rowDifferences, sameMatch } from '../../utils/leagueTable'

const TODAY = new Date().toISOString().slice(0, 10)

function useAdminList<T>(name: string) {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => onSnapshot(collection(db, name), (snapshot) => setItems(snapshot.docs.map((item) => ({ ...(item.data() as T), id: item.id }))), () => setItems([])), [name])
  return items
}

export default function LeagueResults({ standings, fixtures }: { standings: Standing[]; fixtures: Fixture[] }) {
  const { showToast } = useToast()
  const added = useAdminList<LeagueResult>('leagueResults')
  const addedFixtures = useAdminList<LeagueFixture & { id: string }>('leagueFixtures')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [date, setDate] = useState(TODAY)
  const [fixtureText, setFixtureText] = useState('')
  const [fixtureDate, setFixtureDate] = useState(TODAY)
  const teams = standings.map((row) => row.team)

  // Every league result once: official list, results added here, then Ekhaya's
  // finished league matches from the match centre (only those not listed yet).
  const results = useMemo(() => {
    const list: LeagueResult[] = [...OFFICIAL_RESULTS]
    for (const item of added) if (!list.some((other) => other.id === item.id || sameMatch(other, item))) list.push(item)
    for (const fixture of fixtures) {
      if (fixture.isTest || fixture.status !== 'finished' || isCupCompetition(fixture.competition) || fixture.homeScore == null || fixture.awayScore == null) continue
      const item: LeagueResult = { id: fixture.id, week: 0, date: fixture.date.slice(0, 10), home: fixture.home, away: fixture.away, homeScore: fixture.homeScore, awayScore: fixture.awayScore }
      const same = list.findIndex((other) => sameMatch(other, item))
      if (same < 0) list.push(item)
    }
    return list
  }, [added, fixtures])
  const computed = useMemo(() => computeTable(results), [results])
  const byTeam = (team: string) => computed.get(norm(team))
  const differences = standings.map((row) => ({ row, diff: byTeam(row.team) ? rowDifferences(row, byTeam(row.team)!) : ['no results found for this team'] })).filter((item) => item.diff.length)
  const parsed = text.trim() ? parseResults(text, teams, date) : []
  const goodLines = parsed.filter((item) => item.result).map((item) => item.result as LeagueResult)

  // The next league match for each team (week 18 list, then fixtures added here, then Ekhaya's fixtures).
  const nextFor = (team: string, played: LeagueResult[] = results) => {
    // The club's own fixtures come first, so Ekhaya's date and stadium win.
    const options = [...fixtures.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest && !isCupCompetition(fixture.competition)).map((fixture) => ({ week: 0, date: fixture.date.slice(0, 10), home: fixture.home, away: fixture.away, venue: fixture.venue ?? undefined })), ...addedFixtures, ...NEXT_FIXTURES]
      .filter((item) => (norm(item.home) === norm(team) || norm(item.away) === norm(team)) && !played.some((result) => sameMatch(result, item)) && item.date >= TODAY)
      .sort((a, b) => a.date.localeCompare(b.date))
    const next = options[0]
    return next ? { opponent: norm(next.home) === norm(team) ? next.away : next.home, date: next.date, home: norm(next.home) === norm(team), ...(next.venue ? { venue: next.venue } : {}) } : null
  }

  /** Rewrites every row from the results (numbers, order, form and its matches, next match). */
  async function rebuild(extra: LeagueResult[] = []) {
    const all = [...results]
    for (const item of extra) if (!all.some((other) => sameMatch(other, item))) all.push(item)
    const table = computeTable(all)
    const ordered = standings.map((row) => ({ row, calc: table.get(norm(row.team)) })).filter((item) => item.calc)
      .sort((a, b) => b.calc!.points - a.calc!.points || (b.calc!.goalsFor - b.calc!.goalsAgainst) - (a.calc!.goalsFor - a.calc!.goalsAgainst) || b.calc!.goalsFor - a.calc!.goalsFor || a.row.team.localeCompare(b.row.team))
    const batch = writeBatch(db)
    ordered.forEach(({ row, calc }, index) => {
      const c = calc!
      batch.set(doc(db, 'standings', row.id), {
        position: index + 1, previousPosition: row.position ?? index + 1,
        played: c.played, won: c.won, drawn: c.drawn, lost: c.lost, goalsFor: c.goalsFor, goalsAgainst: c.goalsAgainst,
        goalDifference: c.goalsFor - c.goalsAgainst, points: c.points,
        form: c.history.slice(-5).map((item) => item.result), formHistory: c.history.slice(-10), next: nextFor(row.team, all),
        updatedAt: serverTimestamp(),
      }, { merge: true })
    })
    await batch.commit()
    return ordered.length
  }

  async function fixAll() {
    setBusy(true)
    try { const count = await rebuild(); showToast(`Table rebuilt from ${results.length} results: ${count} teams, with form and next matches.`) }
    catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') }
    finally { setBusy(false) }
  }

  async function saveWeek() {
    if (!goodLines.length) return
    const duplicates = goodLines.filter((item) => results.some((other) => sameMatch(other, item)))
    const fresh = goodLines.filter((item) => !duplicates.includes(item))
    if (!fresh.length) { showToast('These results are already counted.', 'error'); return }
    if (!window.confirm(`Add ${fresh.length} result(s) and update the table?${duplicates.length ? `\n\nAlready counted (skipped): ${duplicates.map((item) => `${item.home} v ${item.away}`).join(', ')}` : ''}`)) return
    setBusy(true)
    try {
      const batch = writeBatch(db)
      fresh.forEach((item) => batch.set(doc(db, 'leagueResults', item.id), { ...item, createdAt: serverTimestamp() }))
      await batch.commit()
      await rebuild(fresh)
      showToast(`${fresh.length} result(s) added. Table, form and positions updated.`)
      setText('')
    } catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') }
    finally { setBusy(false) }
  }

  async function saveFixtures() {
    const known = (name: string) => teams.find((team) => norm(team) === norm(name)) ?? teams.find((team) => norm(team).includes(norm(name)) || norm(name).includes(norm(team)))
    const lines = fixtureText.split('\n').map((line) => line.trim()).filter(Boolean)
    const list = lines.map((line) => { const m = line.match(/^(.+?)\s+(?:v|vs|-|–)\.?\s+(.+?)(?:\s*[,(@]\s*(.+?)\)?)?$/i); const home = m && known(m[1]); const away = m && known(m[2]); return home && away ? { date: line.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? fixtureDate, home, away, venue: m?.[3]?.trim() } : null })
    const good = list.filter((item): item is NonNullable<typeof item> => Boolean(item))
    if (!good.length) { showToast('Write one match per line, like: Creck Sporting v Red Lions', 'error'); return }
    setBusy(true)
    try {
      const batch = writeBatch(db)
      good.forEach((item) => batch.set(doc(db, 'leagueFixtures', `${item.date}-${item.home}-${item.away}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')), { week: 0, date: item.date, home: item.home, away: item.away, ...(item.venue ? { venue: item.venue } : {}), createdAt: serverTimestamp() }))
      await batch.commit()
      showToast(`${good.length} fixture(s) saved${good.length < lines.length ? ` (${lines.length - good.length} line(s) not understood)` : ''}. Tap "Update the table" to show them in the ? boxes.`)
      setFixtureText('')
    } catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') }
    finally { setBusy(false) }
  }

  return <Card className="admin-card league-results">
    <div className="fz-card-heading"><ListChecks size={18} aria-hidden="true" /><div><h2>Form tracker</h2><span>{results.length} league results · checked against the table</span></div></div>
    {differences.length === 0
      ? <p className="te-ok"><CheckCircle2 size={15} aria-hidden="true" /> The table and every team's form match all {results.length} results.</p>
      : <div className="lr-diff"><p className="te-problems-title">⚠ {differences.length} team(s) don't match the results:</p><ul className="te-problems">{differences.map(({ row, diff }) => <li key={row.id}><strong>{row.team}</strong>: {diff.join(' · ')}</li>)}</ul></div>}
    <div className="admin-actions"><Button type="button" variant={differences.length ? 'primary' : 'secondary'} disabled={busy} icon={<RefreshCw size={16} />} onClick={() => void fixAll()}>{busy ? 'Saving…' : differences.length ? 'Fix the table from the results' : 'Update the table (form details and next matches)'}</Button></div>

    <details className="lr-add" open={!differences.length}>
      <summary>Add this week's results</summary>
      <label className="admin-field"><span>Date (used when a line has no date)</span><input type="date" value={date} onChange={(event) => setDate(event.target.value || TODAY)} /></label>
      <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Luanar Mitundu 1-0 MAFCO F.C\nSilver Strikers 2-1 Kamuzu Barracks\nFCB Nyasa Big Bullets 0-0 Civil Service United\n…'} />
      {parsed.length > 0 && <ul className="lr-preview">{parsed.map((item, index) => <li key={index} className={item.problem ? 'bad' : results.some((other) => item.result && sameMatch(other, item.result)) ? 'dup' : 'ok'}>
        {item.result ? <>{item.result.home} <b>{item.result.homeScore}–{item.result.awayScore}</b> {item.result.away} <small>{item.result.date}{results.some((other) => sameMatch(other, item.result!)) ? ' · already counted' : ''}</small></> : <>{item.line} <small>{item.problem}</small></>}
      </li>)}</ul>}
      <p className="live-help">One match per line (home team, score, away team), or paste straight from Flashscore: dates, team names and scores are read for you. Ekhaya's own match is counted by the match centre, so you can leave it out. Saving updates the points, order and form for everyone.</p>
      <Button type="button" disabled={busy || !goodLines.length} onClick={() => void saveWeek()}>{busy ? 'Saving…' : `Add ${goodLines.length} result${goodLines.length === 1 ? '' : 's'}`}</Button>
    </details>

    <details className="lr-add">
      <summary>Next week's fixtures (for the ? box)</summary>
      <label className="admin-field"><span>Date</span><input type="date" value={fixtureDate} onChange={(event) => setFixtureDate(event.target.value || TODAY)} /></label>
      <textarea rows={5} value={fixtureText} onChange={(event) => setFixtureText(event.target.value)} placeholder={'Creck Sporting v Red Lions, Civo Stadium\nKaronga United v Mighty Wanderers'} />
      <Button type="button" variant="secondary" disabled={busy || !fixtureText.trim()} onClick={() => void saveFixtures()}>Save fixtures</Button>
    </details>
  </Card>
}
