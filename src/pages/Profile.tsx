import { useAuth } from '../auth/AuthContext'
import LogoutButton from '../components/LogoutButton'

export default function Profile() {
  const { user, profile } = useAuth()

  return (
    <div className="card profile-card">
      <h2>Fan Profile</h2>
      <p>{profile?.fullName || user?.displayName || 'Ekhaya supporter'}</p>
      <p>{user?.email}</p>
      <LogoutButton />
    </div>
  )
}
