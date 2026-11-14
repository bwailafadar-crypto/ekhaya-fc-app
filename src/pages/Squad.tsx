import { Bandage, ChevronRight, UserRound, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import PlayerAvatar from '../components/PlayerAvatar'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { inSquad, type Squad } from '../hooks/useSquad'
import type { Player } from '../types'

const positions = [
  { key: 'GK', label: 'Goalkeepers' },
  { key: 'DEF', label: 'Defenders' },
  { key: 'MID', label: 'Midfielders' },
  { key: 'FWD', label: 'Forwards' },
  { key: null, label: 'Squad' },
] as const

export default function Squad({ squad = 'men' }: { squad?: Squad }) {
  const { items, loading, error } = useFirestoreCollection<Player>('players')

  if (loading) return <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
  if (error) return <EmptyState icon={UsersRound} title="Squad unavailable" description={error} />

  const squadItems = items.filter((player) => inSquad(player.squad, squad))
  return <>
    <PageHeader eyebrow={squad === 'women' ? 'The Cowgirls' : 'The Ekhaya team'} title={squad === 'women' ? "Women's team" : 'First team'} description={`${squadItems.length} players`} />
    {squadItems.length === 0 ? <EmptyState icon={UsersRound} title={`No ${squad === 'women' ? "women's" : "men's"} squad yet`} description="Players will appear here when the club publishes the squad." /> : positions.map(({ key, label }) => {
      const group = squadItems.filter((player) => player.position === key)
        .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000) || a.name.localeCompare(b.name))
      if (group.length === 0) return null
      return <section className="squad-section" key={label}>
        <h2 className="squad-section-title">{label}<span>{group.length}</span></h2>
        <div className="squad-list">
          {group.map((player) => <Link className="player-row" key={player.id} to={`/squad/${player.id}`}>
            <span className="player-number">{player.number ?? '—'}</span>
            <PlayerAvatar player={player} />
            <span className="player-row-copy"><strong>{player.name}{player.injured && <em className="player-injured"><Bandage size={11} aria-hidden="true" /> Injured</em>}</strong><small>{player.nationality || 'Malawian'}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>)}
        </div>
      </section>
    })}
    <div className="squad-note"><UserRound size={15} /> Player details may be completed by club administrators.</div>
  </>
}
