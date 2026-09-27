import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Skeleton } from '../components/UI'
import { useAuth, type AppRole } from './AuthContext'

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children?: ReactNode
  allowedRoles?: AppRole[]
}) {
  const { user, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="auth-loading"><Skeleton /></div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRoles && !allowedRoles.includes(role ?? 'fan')) {
    return <Navigate to="/" replace />
  }

  return children ?? <Outlet />
}