import { ArrowLeft, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { Fixture, Player } from '../types'
import { sortByDate } from '../utils/football'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import PlayerAvatar from '../components/PlayerAvatar'

const stats = [
  ['Appearances', 'appearances'],
  ['Starts', 'starts'],
  ['Minutes', 'minutes'],
  ['Goals', 'goals'],
  ['Assists', 'assists'],
  ['Yellow cards', 'yellowCards'],
  ['Red cards', 'redCards'],
] as const

function playerAge(dob: string | null) {
  if (!dob) return null
  const birthDate = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  if (today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1
  return age
}

export default function PlayerDetailPage() {
  const { id } = useParams()
  const { items, loading, error } = useFirestoreCollection<Player>('players')
  const player = items.find((item) => item.id === id)
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const awards = sortByDate(fixtures.items.filter((fixture) => fixture.motmClosed && fixture.motmWinnerId === id && !fixture.isTest), 'desc')

  if (loading) {
    return <div className="player-detail-loading"><Skeleton /><Skeleton /><Skeleton /></div>
  }
  if (error) return <EmptyState icon={UserRound} title="Could not load player" description={error} />
  if (!player) return <EmptyState icon={UserRound} title="Player not found" description="This player may have been removed from the squad." />

  const age = playerAge(player.dob)
  return (
    <>
      <Link className="back-link" to="/squad"><ArrowLeft size={17} /> Squad</Link>
      <section className="player-hero">
        <PlayerAvatar player={player} large />
        <div className="player-profile-heading">
          <span className="page-eyebrow">{player.position ?? 'Squad'}{player.number == null ? '' : ` · #${player.number}`}</span>
          <h1>{player.name}</h1>
          <p>{player.team === 'senior' ? 'Senior team' : player.team}</p>
        </div>
      </section>

      {awards.length > 0 && <section className="player-awards" aria-label="Man of the match awards">
        <span className="player-awards-star" aria-hidden="true">★</span>
        <div><strong>Fans' man of the match ×{awards.length}</strong><ul>{awards.slice(0, 5).map((fixture) => <li key={fixture.id}><Link to={`/live?match=${fixture.id}&tab=vote`}>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away}</Link></li>)}</ul></div>
      </section>}

      <PageHeader eyebrow="Player details" title="Player profile" />
      <section className="player-facts" aria-label="Player details">
        <Fact label="Date of birth" value={player.dob ? `${player.dob}${age == null ? '' : ` · ${age} years`}` : null} />
        <Fact label="Nationality" value={player.nationality} />
        <Fact label="Preferred foot" value={player.preferredFoot} />
        <Fact label="Height" value={player.heightCm == null ? null : `${player.heightCm} cm`} />
      </section>

      <PageHeader eyebrow="Season totals" title="Statistics" />
      <section className="player-stats-grid" aria-label="Player statistics">
        {stats.map(([label, key]) => <Stat key={key} label={label} value={player.stats?.[key] ?? 0} />)}
        {player.position === 'GK' && <Stat label="Clean sheets" value={player.stats?.cleanSheets ?? 0} />}
      </section>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="player-fact">
      <span>{label}</span>
      <strong>{value || 'Not provided'}</strong>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="player-stat">
      <strong className="number">{value}</strong>
      <span>{label}</span>
    </div>
  )
}