import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '../components/UI'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="auth-loading"><Skeleton /></div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children ?? <Outlet />
}