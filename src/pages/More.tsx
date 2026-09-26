import { Link } from 'react-router-dom'

const items = [
  { to: '/results', label: 'Results', icon: '🏆' },
  { to: '/squad', label: 'Squad', icon: '👥' },
  { to: '/news', label: 'News', icon: '📰' },
  { to: '/fanzone', label: 'Fan Zone', icon: '🗣️' },
  { to: '/membership', label: 'Membership', icon: '🎫' },
  { to: '/profile', label: 'Fan Profile', icon: '👤' },
]

export default function More() {
  return (
    <div className="menu-list">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="menu-item">
          <span>{i.icon}</span>
          <span>{i.label}</span>
          <span className="arrow">›</span>
        </Link>
      ))}
    </div>
  )
}
