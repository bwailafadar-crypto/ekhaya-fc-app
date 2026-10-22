import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { Skeleton } from '../components/UI'
import { useAuth, type AppRole } from './AuthContext'

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children?: ReactNode
  allowedRoles?: AppRole[]
}) {
  const { user, role, profile, loading } = useAuth()
  const location = useLocation()
  // Admin pages: wait for the profile (it holds the role) instead of sending an
  // admin to Home on a slow connection. Give up after 15 seconds.
  const waitingForRole = Boolean(allowedRoles && user && !profile)
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!waitingForRole) return
    const timer = window.setTimeout(() => setGaveUp(true), 15000)
    return () => window.clearTimeout(timer)
  }, [waitingForRole])

  if (loading) {
    return <div className="auth-loading"><Skeleton /></div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (waitingForRole && !gaveUp) {
    return <div className="auth-loading"><Skeleton /></div>
  }

  if (allowedRoles && !allowedRoles.includes(role ?? 'fan')) {
    return <Navigate to="/" replace />
  }

  return children ?? <Outlet />
}