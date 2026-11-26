import { ArrowRight, Goal, Table2 } from 'lucide-react'
import { useState } from 'react'
import { useFlag } from '../hooks/useFlag'
import TeamLogo from '../components/TeamLogo'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { inSquad, type Squad } from '../hooks/useSquad'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { Fixture, FormEntry, Standing } from '../types'
import { formatMalawiDate } from '../utils/football'

const TOP8 = 8
const RELEGATED = 3

export default function LeagueTable({ squad = 'men' }: { squad?: Squad }) {
  const { items, loading, error } = useFirestoreCollection<Standing>('standings')
  const rows = [...items].filter((row) => inSquad(row.squad, squad)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  // Phones show the short table (MP, G, PTS, form); "All columns" adds W, D, L and GD.
  const [full, setFull] = useState(false)
  const scorersOpen = useFlag('topScorers')
  // Tapping a form box shows the match behind it.
  const [detail, setDetail] = useState<MatchCardData | null>(null)
  // Last 5, latest first, with match details when the app knows them.
  const formEntries = (row: Standing): FormEntry[] => {
    const form = (row.form ?? []).slice(-5)
    const history = row.formHistory ?? []
    const known = history.length && history.slice(-5).map((item) => item.result).join('') === form.join('') ? history.slice(-5) : form.map((result) => ({ fixtureId: '', result }))
    return [...known].reverse()
  }
  const norm = (name: string) => name.trim().toLowerCase()
  // Next league match for a team, when the app knows it (Ekhaya's fixtures).
  const nextFor = (team: string) => fixtures.items
    .filter((fixture) => inSquad(fixture.squad, squad) && fixture.status === 'upcoming' && !fixture.isTest && (norm(fixture.home) === norm(team) || norm(fixture.away) === norm(team)))
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return <>
    <PageHeader eyebrow="2026 season" title={squad === 'women' ? "Women's league table" : 'League table'} description={squad === 'women' ? "The Cowgirls' league standings" : "The Cowboys in the FDH Championship"} />
    {loading ? <div className="table-loading"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={Table2} title="Table unavailable" description={error} />
        : rows.length === 0 ? <EmptyState icon={Table2} title="Standings are not available" description="The club table will appear here when data is added." />
          : <><div className="standings-view" role="group" aria-label="Table view"><button type="button" className={!full ? 'active' : ''} onClick={() => setFull(false)}>Short</button><button type="button" className={full ? 'active' : ''} onClick={() => setFull(true)}>All columns</button></div><div className={`standings-scroll${full ? ' standings-full' : ''}`} role="region" aria-label="League standings" tabIndex={0}>
            <table className="standings-table">
              <thead>
                <tr><th scope="col">#</th><th scope="col" className="standings-team-heading">Team</th><th scope="col" title="Matches played">MP</th><th scope="col" className="col-extra">W</th><th scope="col" className="col-extra">D</th><th scope="col" className="col-extra">L</th>{squad === 'women' ? <th scope="col" title="Goal difference">GD</th> : <><th scope="col" title="Goals for : goals against">G</th><th scope="col" className="col-extra" title="Goal difference">GD</th></>}<th scope="col">PTS</th><th scope="col" className="standings-form-heading" title="Next match, then the last 5 results (latest first)">Form</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  // Men's: top 8 (Airtel Top 8), bottom 3 relegated. Women's: top 2, bottom 2.
                  const topN = squad === 'women' ? 2 : TOP8
                  const relN = squad === 'women' ? 2 : RELEGATED
                  const zone = rows.length > topN + relN && index < topN ? 'zone-top8' : rows.length > topN + relN && index >= rows.length - relN ? 'zone-relegation' : ''
                  const isEkhaya = row.team.trim().toLowerCase().startsWith('ekhaya')
                  const form = row.form ?? []
                  return <tr key={row.id} className={[zone, isEkhaya ? 'standings-ekhaya' : ''].filter(Boolean).join(' ') || undefined}>
                    <td className="standings-position" title={zone === 'zone-top8' ? (squad === 'women' ? 'Top 2' : 'Airtel Top 8 place') : zone === 'zone-relegation' ? 'Relegation place' : undefined}>{row.position ?? 0}{row.previousPosition != null && row.previousPosition !== row.position && <span className={row.previousPosition > row.position ? 'pos-up' : 'pos-down'} aria-label={row.previousPosition > row.position ? `Up ${row.previousPosition - row.position}` : `Down ${row.position - row.previousPosition}`}>{row.previousPosition > row.position ? '▲' : '▼'}</span>}</td>
                    <th scope="row" className="standings-team"><span className="standings-team-content"><TeamLogo name={row.team} /><span>{row.team}</span></span></th>
                    <td>{row.played ?? 0}</td><td className="col-extra">{row.won ?? 0}</td><td className="col-extra">{row.drawn ?? 0}</td><td className="col-extra">{row.lost ?? 0}</td>
                    {squad === 'women' ? <td className="standings-goals">{(row.goalDifference ?? 0) > 0 ? '+' : ''}{row.goalDifference ?? 0}</td> : <><td className="standings-goals">{row.goalsFor ?? 0}:{row.goalsAgainst ?? 0}</td><td className="col-extra">{row.goalDifference ?? 0}</td></>}
                    <td className="standings-points">{row.points ?? 0}</td>
                    <td><div className="table-form-boxes" aria-label={`Last results, latest first: ${form.slice(-5).reverse().join(' ')}`}>
                      {(() => {
                        const saved = row.next
                        const fixture = saved ? null : nextFor(row.team)
                        const next = saved ?? (fixture ? { opponent: norm(fixture.home) === norm(row.team) ? fixture.away : fixture.home, date: fixture.date, home: norm(fixture.home) === norm(row.team), venue: fixture.venue ?? undefined } : null)
                        const label = next ? `Next: ${next.home ? 'v' : 'at'} ${next.opponent} · ${formatMalawiDate(next.date)}${next.venue ? ` · ${next.venue}` : ''}` : 'Next match not known yet'
                        return <button type="button" className="form-box form-box-next" title={label} aria-label={label} onClick={() => setDetail(next ? { kind: 'next', home: next.home ? row.team : next.opponent, away: next.home ? next.opponent : row.team, date: next.date, venue: next.venue, team: row.team } : { kind: 'unknown', team: row.team })}>?</button>
                      })()}
                      {formEntries(row).map((entry, index) => {
                        const label = `${entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss'}${entry.score ? ` ${entry.score}` : ''}${entry.opponent ? ` ${entry.home === false ? 'at' : 'v'} ${entry.opponent}` : ''}${entry.date ? ` · ${formatMalawiDate(entry.date)}` : ''}`
                        return <button type="button" key={`${entry.result}-${index}`} className={`form-box form-box-${entry.result.toLowerCase()}`} title={label} aria-label={label} onClick={() => setDetail(entry.opponent ? { kind: 'played', team: row.team, result: entry.result, home: entry.home === false ? entry.opponent : row.team, away: entry.home === false ? row.team : entry.opponent, homeScore: entry.score ? Number(entry.score.split('–')[entry.home === false ? 1 : 0]) : undefined, awayScore: entry.score ? Number(entry.score.split('–')[entry.home === false ? 0 : 1]) : undefined, date: entry.date, fixtureId: entry.fixtureId } : { kind: 'nodetail', team: row.team, result: entry.result })}>{entry.result}</button>
                      })}
                    </div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>{detail && <MatchSheet data={detail} fixtures={fixtures.items} onClose={() => setDetail(null)} />}</>}
    {squad === 'men' && rows.length > TOP8 + RELEGATED && <ul className="table-zones" aria-label="What the colours mean">
      <li><i className="zone-key zone-key-top8" aria-hidden="true" />1–{TOP8}: Airtel Top 8</li>
      <li><i className="zone-key zone-key-relegation" aria-hidden="true" />Last {RELEGATED}: relegated</li>
    </ul>}
    {squad === 'women' && rows.length > 4 && <ul className="table-zones" aria-label="What the colours mean">
      <li><i className="zone-key zone-key-top8" aria-hidden="true" />Top 2</li>
      <li><i className="zone-key zone-key-relegation" aria-hidden="true" />Last 2: relegated</li>
    </ul>}
    {squad === 'men' && scorersOpen && <Link className="table-scorers-link" to="/scorers"><Goal size={15} aria-hidden="true" /> Top scorers &amp; Golden Boot race <ArrowRight size={14} aria-hidden="true" /></Link>}
    <p className="table-scroll-hint">{full ? 'Swipe sideways to see all columns. ' : ''}Form: next match (?), then the last 5 results, latest first.</p>
  </>
}

type MatchCardData =
  | { kind: 'played'; team: string; result: 'W' | 'D' | 'L'; home: string; away: string; homeScore?: number; awayScore?: number; date?: string; fixtureId: string }
  | { kind: 'next'; team: string; home: string; away: string; date: string; venue?: string }
  | { kind: 'nodetail'; team: string; result: 'W' | 'D' | 'L' }
  | { kind: 'unknown'; team: string }

/** The match behind a form box (or the next match), shown when it is tapped. */
function MatchSheet({ data, fixtures, onClose }: { data: MatchCardData; fixtures: Fixture[]; onClose: () => void }) {
  const resultWord = (result: 'W' | 'D' | 'L') => (result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss')
  // Ekhaya's own matches open their match report.
  const n = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')
  const near = (a: string, b?: string) => !b || Math.abs(new Date(a.slice(0, 10)).getTime() - new Date(b).getTime()) <= 4 * 86400000
  const clubMatch = data.kind === 'played' ? fixtures.find((fixture) => fixture.id === data.fixtureId || (fixture.status === 'finished' && !fixture.isTest && n(fixture.home) === n(data.home) && n(fixture.away) === n(data.away) && near(fixture.date, data.date))) : undefined
  const nextClub = data.kind === 'next' ? fixtures.find((fixture) => fixture.status !== 'finished' && fixture.home === data.home && fixture.away === data.away) : undefined
  return createPortal(<div className="match-sheet-backdrop" role="presentation" onClick={onClose}>
    <div className="match-sheet" role="dialog" aria-modal="true" aria-label="Match" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="match-sheet-close" aria-label="Close" onClick={onClose}>×</button>
      {data.kind === 'played' || data.kind === 'next' ? <>
        <p className="match-sheet-label">{data.kind === 'played' ? <><span className={`form-box form-box-${data.result.toLowerCase()}`}>{data.result}</span> {resultWord(data.result)} for {data.team}</> : <>Next match for {data.team}</>}</p>
        <div className="match-sheet-teams">
          <div><TeamLogo name={data.home} crest /><span>{data.home}</span></div>
          <strong>{data.kind === 'played' && data.homeScore != null ? `${data.homeScore} – ${data.awayScore}` : 'v'}</strong>
          <div><TeamLogo name={data.away} crest /><span>{data.away}</span></div>
        </div>
        <p className="match-sheet-meta">{data.date ? formatMalawiDate(data.date) : ''}{data.kind === 'next' && data.venue ? ` · ${data.venue}` : ''}{data.kind === 'played' ? ' · Full time' : ''}</p>
        {clubMatch && <Link className="match-sheet-link" to={`/report/${encodeURIComponent(clubMatch.id)}`}>Open the match report</Link>}
        {nextClub && <Link className="match-sheet-link" to={`/live?match=${encodeURIComponent(nextClub.id)}`}>Open the match page</Link>}
      </> : <p className="match-sheet-meta">{data.kind === 'nodetail' ? `${resultWord(data.result)} for ${data.team}. The match details are not saved for this one.` : `${data.team}'s next match is not known yet.`}</p>}
    </div>
  </div>, document.body)
}
