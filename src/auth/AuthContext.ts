import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

export type AppRole = 'fan' | 'admin' | 'superadmin'

export type UserProfile = {
  role: AppRole
  email: string
  fullName: string
  phone: string | null
  legacyFanDocId: string | null
  legacyFanId: string | null
}

export type SignUpDetails = {
  fullName: string
  phone: string
  email: string
  password: string
}

export type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  role: AppRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (details: SignUpDetails) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}