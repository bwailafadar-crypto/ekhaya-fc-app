import { ChevronRight, UserRound, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import PlayerAvatar from '../components/PlayerAvatar'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Player } from '../types'

const positions = [
  { key: 'GK', label: 'Goalkeepers' },
  { key: 'DEF', label: 'Defenders' },
  { key: 'MID', label: 'Midfielders' },
  { key: 'FWD', label: 'Forwards' },
  { key: null, label: 'Squad' },
] as const

export default function Squad() {
  const { items, loading, error } = useFirestoreCollection<Player>('players')

  if (loading) return <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
  if (error) return <EmptyState icon={UsersRound} title="Squad unavailable" description={error} />
  if (items.length === 0) return <EmptyState icon={UsersRound} title="Squad not available" description="Players will appear here when the club publishes the squad." />

  return <>
    <PageHeader eyebrow="The Ekhaya team" title="First team" description={`${items.length} players`} />
    {positions.map(({ key, label }) => {
      const group = items.filter((player) => player.position === key)
        .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000) || a.name.localeCompare(b.name))
      if (group.length === 0) return null
      return <section className="squad-section" key={label}>
        <h2 className="squad-section-title">{label}<span>{group.length}</span></h2>
        <div className="squad-list">
          {group.map((player) => <Link className="player-row" key={player.id} to={`/squad/${player.id}`}>
            <span className="player-number">{player.number ?? '—'}</span>
            <PlayerAvatar player={player} />
            <span className="player-row-copy"><strong>{player.name}{player.injured && <em className="player-injured">Injured</em>}</strong><small>{player.nationality || 'Malawian'}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>)}
        </div>
      </section>
    })}
    <div className="squad-note"><UserRound size={15} /> Player details may be completed by club administrators.</div>
  </>
}
