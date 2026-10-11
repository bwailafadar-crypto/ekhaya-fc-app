import { Table2 } from 'lucide-react'
import TeamLogo from '../components/TeamLogo'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Standing } from '../types'

const TOP8 = 8
const RELEGATED = 3

export default function LeagueTable() {
  const { items, loading, error } = useFirestoreCollection<Standing>('standings')
  const rows = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return <>
    <PageHeader eyebrow="2026 season" title="League table" description="FDH Championship standings" />
    {loading ? <div className="table-loading"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={Table2} title="Table unavailable" description={error} />
        : rows.length === 0 ? <EmptyState icon={Table2} title="Standings are not available" description="The club table will appear here when data is added." />
          : <div className="standings-scroll" role="region" aria-label="League standings" tabIndex={0}>
            <table className="standings-table">
              <thead>
                <tr><th scope="col">Pos</th><th scope="col" className="standings-team-heading">Team</th><th scope="col">P</th><th scope="col">W</th><th scope="col">D</th><th scope="col">L</th><th scope="col">GF</th><th scope="col">GA</th><th scope="col">GD</th><th scope="col">Pts</th><th scope="col" title="Last 5 matches, latest on the right">Form <small className="form-latest-hint">→ latest</small></th></tr>
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
                    <td>{row.played ?? 0}</td><td>{row.won ?? 0}</td><td>{row.drawn ?? 0}</td><td>{row.lost ?? 0}</td>
                    <td>{row.goalsFor ?? 0}</td><td>{row.goalsAgainst ?? 0}</td><td>{(row.goalDifference ?? 0) > 0 ? `+${row.goalDifference}` : row.goalDifference ?? 0}</td>
                    <td className="standings-points">{row.points ?? 0}</td>
                    <td><div className="table-form" aria-label={`Form ${form.join(' ')}`}>
                      {form.slice(-5).map((result, index) => <span key={`${result}-${index}`} className={`table-form-dot form-dot-${result.toLowerCase()}`} title={result} />)}
                    </div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>}
    {rows.length > TOP8 + RELEGATED && <ul className="table-zones" aria-label="What the colours mean">
      <li><i className="zone-key zone-key-top8" aria-hidden="true" />1–{TOP8}: Airtel Top 8</li>
      <li><i className="zone-key zone-key-relegation" aria-hidden="true" />Last {RELEGATED}: relegated</li>
    </ul>}
    <p className="table-scroll-hint">Swipe sideways to see all columns.</p>
  </>
}
