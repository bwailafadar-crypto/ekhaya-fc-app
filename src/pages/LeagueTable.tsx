import { Table2 } from 'lucide-react'
import TeamLogo from '../components/TeamLogo'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Standing } from '../types'

export default function LeagueTable() {
  const { items, loading, error } = useFirestoreCollection<Standing>('standings')
  const rows = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return <>
    <PageHeader eyebrow="2026 season" title="League table" description="TNM Super League standings" />
    {loading ? <div className="table-loading"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <EmptyState icon={Table2} title="Table unavailable" description={error} />
        : rows.length === 0 ? <EmptyState icon={Table2} title="Standings are not available" description="The club table will appear here when data is added." />
          : <div className="standings-scroll" role="region" aria-label="League standings" tabIndex={0}>
            <table className="standings-table">
              <thead>
                <tr><th scope="col">Pos</th><th scope="col" className="standings-team-heading">Team</th><th scope="col">P</th><th scope="col">W</th><th scope="col">D</th><th scope="col">L</th><th scope="col">GF</th><th scope="col">GA</th><th scope="col">GD</th><th scope="col">Pts</th><th scope="col">Form</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEkhaya = row.id === 'ekhaya-fc' || row.team.toLowerCase() === 'ekhaya fc'
                  const form = row.form ?? []
                  return <tr key={row.id} className={isEkhaya ? 'standings-ekhaya' : ''}>
                    <td className="standings-position">{row.position ?? 0}</td>
                    <th scope="row" className="standings-team"><TeamLogo name={row.team} /><span>{row.team}</span></th>
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
    <p className="table-scroll-hint">Swipe sideways to see all columns.</p>
  </>
}
