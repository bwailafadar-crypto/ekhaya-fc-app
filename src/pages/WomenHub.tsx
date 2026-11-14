// Landing page for the Ekhaya women's team ("The Cowgirls"). Opens from the
// More menu and links to the dedicated women's Squad, Results, Fixtures and Table.
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, Table2, Trophy, Users } from 'lucide-react'
import { PageHeader } from '../components/UI'

const links = [
  { to: '/women/squad', label: 'Squad', icon: Users },
  { to: '/women/results', label: 'Results', icon: Trophy },
  { to: '/women/fixtures', label: 'Fixtures', icon: CalendarDays },
  { to: '/women/table', label: 'League table', icon: Table2 },
]

export default function WomenHub() {
  return <>
    <PageHeader eyebrow="The Cowgirls" title="Ekhaya Women" description="Ekhaya FC women's team" />
    <div className="menu-list">
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="menu-item">
          <l.icon className="menu-icon" size={20} aria-hidden="true" />
          <span>{l.label}</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  </>
}
