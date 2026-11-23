import { Link } from 'react-router-dom'
import { Activity, BarChart3, ScrollText, ChevronRight, CircleUserRound, Clapperboard, ClipboardList, Gift, Landmark, Newspaper, HeartHandshake, Medal, ShieldCheck, ShoppingBag, Trophy, Users, UsersRound, Vote } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useFlag } from '../hooks/useFlag'
import LogoutButton from '../components/LogoutButton'
import InstallSharePanel from '../components/InstallSharePanel'

const items = [
  { to: '/predictor', label: 'Predictor · win a jersey or ticket', icon: Gift },
  { to: '/competitions', label: 'Competitions · league & cups', icon: Medal },
  { to: '/results', label: 'Results', icon: Trophy },
  { to: '/squad', label: 'Squad', icon: Users },
  { to: '/women', label: 'Ekhaya Women · The Cowgirls', icon: UsersRound },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/tv', label: 'Ekhaya TV · videos & live', icon: Clapperboard },
  { to: '/club', label: 'Club & honours · trophy cabinet', icon: Landmark },
  { to: '/shop', label: 'Club Shop · kits & merchandise', icon: ShoppingBag },
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
  const tvOpen = useFlag('ekhayaTv')
  const shopOpen = useFlag('clubShop') || canManage
  const visible = items.filter((item) => (item.to !== '/shop' || shopOpen) && (item.to !== '/community' || fanFamily) && (item.to !== '/competitions' || competitions))

  return (
    <div className="menu-list">
      {visible.map((i) => (
        <Link key={i.to} to={i.to} className="menu-item">
          <i.icon className="menu-icon" size={20} aria-hidden="true" />
          <span>{i.label}{((i.to === '/membership' && !membershipOpen) || (i.to === '/tv' && !tvOpen)) && <small className="menu-soon">Coming soon</small>}</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      ))}
      {role === 'superadmin' && (
        <Link to="/sales" className="menu-item">
          <BarChart3 className="menu-icon" size={20} aria-hidden="true" />
          <span>Sales dashboard · jersey orders</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      )}
      {role === 'superadmin' && (
        <Link to="/activity-log" className="menu-item">
          <ScrollText className="menu-icon" size={20} aria-hidden="true" />
          <span>Activity log · who changed what</span>
          <ChevronRight className="arrow" size={18} aria-hidden="true" />
        </Link>
      )}
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
