import { Link } from 'react-router-dom'
import { ChevronRight, CircleUserRound, ClipboardList, Newspaper, ShieldCheck, Trophy, Users, Vote } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import LogoutButton from '../components/LogoutButton'
import InstallSharePanel from '../components/InstallSharePanel'

const items = [
  { to: '/results', label: 'Results', icon: Trophy },
  { to: '/squad', label: 'Squad', icon: Users },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/fanzone', label: 'Fan Zone', icon: Vote },
  { to: '/membership', label: 'Membership', icon: ShieldCheck },
  { to: '/profile', label: 'Fan Profile', icon: CircleUserRound },
]

export default function More() {
  const { role } = useAuth()
  const canManage = role === 'admin' || role === 'superadmin'

  return (
    <div className="menu-list">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="menu-item">
          <i.icon className="menu-icon" size={20} aria-hidden="true" />
          <span>{i.label}</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
      {canManage && (
        <Link to="/admin" className="menu-item">
          <ClipboardList className="menu-icon" size={20} aria-hidden="true" />
          <span>Admin</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      )}
      <InstallSharePanel compact />
      <LogoutButton />
    </div>
  )
}
