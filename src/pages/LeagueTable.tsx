import { Table2 } from 'lucide-react'
import { useState } from 'react'
import TeamLogo from '../components/TeamLogo'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, FormEntry, Standing } from '../types'
import { formatMalawiDate } from '../utils/football'

const TOP8 = 8
const RELEGATED = 3

export default function LeagueTable() {
  const { items, loading, error } = useFirestoreCollection<Standing>('standings')
  const rows = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  // Phones show the short table (MP, G, PTS, form); "All columns" adds W, D, L and GD.
  const [full, setFull] = useState(false)
  // Tapping a form box shows the match behind it.
  const [detail, setDetail] = useState<{ team: string; text: string } | null>(null)
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
    .filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest && (norm(fixture.home) === norm(team) || norm(fixture.away) === norm(team)))
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return <>
    <PageHeader eyebrow="2026 season" title="League table" description="FDH Championship standings" />
    {loading ? <div className="table-loading"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={Table2} title="Table unavailable" description={error} />
        : rows.length === 0 ? <EmptyState icon={Table2} title="Standings are not available" description="The club table will appear here when data is added." />
          : <><div className="standings-view" role="group" aria-label="Table view"><button type="button" className={!full ? 'active' : ''} onClick={() => setFull(false)}>Short</button><button type="button" className={full ? 'active' : ''} onClick={() => setFull(true)}>All columns</button></div><div className={`standings-scroll${full ? ' standings-full' : ''}`} role="region" aria-label="League standings" tabIndex={0}>
            <table className="standings-table">
              <thead>
                <tr><th scope="col">#</th><th scope="col" className="standings-team-heading">Team</th><th scope="col" title="Matches played">MP</th><th scope="col" className="col-extra">W</th><th scope="col" className="col-extra">D</th><th scope="col" className="col-extra">L</th><th scope="col" title="Goals for : goals against">G</th><th scope="col" className="col-extra" title="Goal difference">GD</th><th scope="col">PTS</th><th scope="col" className="standings-form-heading" title="Next match, then the last 5 results (latest first)">Form</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  // 1–8 play in the Airtel Top 8; the last 3 go down (only once the table has enough teams).
                  const zone = rows.length > TOP8 + RELEGATED && index < TOP8 ? 'zone-top8' : rows.length > TOP8 + RELEGATED && index >= rows.length - RELEGATED ? 'zone-relegation' : ''
                  const isEkhaya = row.id === 'ekhaya-fc' || row.team.toLowerCase() === 'ekhaya fc'
                  const form = row.form ?? []
                  return <tr key={row.id} className={[zone, isEkhaya ? 'standings-ekhaya' : ''].filter(Boolean).join(' ') || undefined}>
                    <td className="standings-position" title={zone === 'zone-top8' ? 'Airtel Top 8 place' : zone === 'zone-relegation' ? 'Relegation place' : undefined}>{row.position ?? 0}{row.previousPosition != null && row.previousPosition !== row.position && <span className={row.previousPosition > row.position ? 'pos-up' : 'pos-down'} aria-label={row.previousPosition > row.position ? `Up ${row.previousPosition - row.position}` : `Down ${row.position - row.previousPosition}`}>{row.previousPosition > row.position ? '▲' : '▼'}</span>}</td>
                    <th scope="row" className="standings-team"><span className="standings-team-content"><TeamLogo name={row.team} /><span>{row.team}</span></span></th>
                    <td>{row.played ?? 0}</td><td className="col-extra">{row.won ?? 0}</td><td className="col-extra">{row.drawn ?? 0}</td><td className="col-extra">{row.lost ?? 0}</td>
                    <td className="standings-goals">{row.goalsFor ?? 0}:{row.goalsAgainst ?? 0}</td><td className="col-extra">{row.goalDifference ?? 0}</td>
                    <td className="standings-points">{row.points ?? 0}</td>
                    <td><div className="table-form-boxes" aria-label={`Last results, latest first: ${form.slice(-5).reverse().join(' ')}`}>
                      {(() => {
                        const saved = row.next
                        const fixture = saved ? null : nextFor(row.team)
                        const next = saved ?? (fixture ? { opponent: norm(fixture.home) === norm(row.team) ? fixture.away : fixture.home, date: fixture.date, home: norm(fixture.home) === norm(row.team), venue: fixture.venue ?? undefined } : null)
                        const label = next ? `Next: ${next.home ? 'v' : 'at'} ${next.opponent} · ${formatMalawiDate(next.date)}${next.venue ? ` · ${next.venue}` : ''}` : 'Next match not known yet'
                        return <button type="button" className="form-box form-box-next" title={label} aria-label={label} onClick={() => setDetail({ team: row.team, text: label })}>?</button>
                      })()}
                      {formEntries(row).map((entry, index) => {
                        const label = `${entry.result === 'W' ? 'Win' : entry.result === 'D' ? 'Draw' : 'Loss'}${entry.score ? ` ${entry.score}` : ''}${entry.opponent ? ` ${entry.home === false ? 'at' : 'v'} ${entry.opponent}` : ''}${entry.date ? ` · ${formatMalawiDate(entry.date)}` : ''}`
                        return <button type="button" key={`${entry.result}-${index}`} className={`form-box form-box-${entry.result.toLowerCase()}`} title={label} aria-label={label} onClick={() => setDetail({ team: row.team, text: label })}>{entry.result}</button>
                      })}
                    </div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>{detail && <div className="form-detail" role="status"><strong>{detail.team}</strong><span>{detail.text}</span><button type="button" aria-label="Close" onClick={() => setDetail(null)}>×</button></div>}</>}
    {rows.length > TOP8 + RELEGATED && <ul className="table-zones" aria-label="What the colours mean">
      <li><i className="zone-key zone-key-top8" aria-hidden="true" />1–{TOP8}: Airtel Top 8</li>
      <li><i className="zone-key zone-key-relegation" aria-hidden="true" />Last {RELEGATED}: relegated</li>
    </ul>}
    <p className="table-scroll-hint">{full ? 'Swipe sideways to see all columns. ' : ''}Form: next match (?), then the last 5 results, latest first.</p>
  </>
}
