import { Link } from 'react-router-dom'
import { Activity, ChevronRight, CircleUserRound, Clapperboard, ClipboardList, Landmark, Newspaper, HeartHandshake, Medal, ShieldCheck, Trophy, Users, Vote } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import LogoutButton from '../components/LogoutButton'
import InstallSharePanel from '../components/InstallSharePanel'

const items = [
  { to: '/competitions', label: 'Competitions · league & cups', icon: Medal },
  { to: '/results', label: 'Results', icon: Trophy },
  { to: '/squad', label: 'Squad', icon: Users },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/tv', label: 'Ekhaya TV · highlights & interviews', icon: Clapperboard },
  { to: '/club', label: 'Club & honours · trophy cabinet', icon: Landmark },
  { to: '/fanzone', label: 'Fan Zone', icon: Vote },
  { to: '/community', label: 'Fan Family · branches & invites', icon: HeartHandshake },
  { to: '/membership', label: 'Membership', icon: ShieldCheck },
  { to: '/profile', label: 'Fan Profile', icon: CircleUserRound },
]

export default function More() {
  const { role } = useAuth()
  const canManage = role === 'admin' || role === 'superadmin'
  const fanFamily = useFlag('fanFamily')
  const competitions = useFlag('competitions')
  const membershipOpen = useFlag('membershipPayments')
  const visible = items.filter((item) => (item.to !== '/community' || fanFamily) && (item.to !== '/competitions' || competitions))

  return (
    <div className="menu-list">
      {visible.map((i) => (
        <Link key={i.to} to={i.to} className="menu-item">
          <i.icon className="menu-icon" size={20} aria-hidden="true" />
          <span>{i.label}{i.to === '/membership' && !membershipOpen && <small className="menu-soon">Coming soon</small>}</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
      {canManage && (
        <Link to="/health" className="menu-item">
          <Activity className="menu-icon" size={20} aria-hidden="true" />
          <span>App health · switches & errors</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      )}
      {canManage && (
        <Link to="/admin" className="menu-item">
          <ClipboardList className="menu-icon" size={20} aria-hidden="true" />
          <span>Admin</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      )}
      <InstallSharePanel compact />
      <LogoutButton />
      <p className="legal-links"><a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a> · <a href="/delete-account.html" target="_blank" rel="noreferrer">Delete your account</a></p>
      <p className="app-version">Version {__APP_BUILD__}</p>
    </div>
  )
}
