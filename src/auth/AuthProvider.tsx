import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, deleteUser } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { auth, db } from '../firebase'
import { AuthContext, type AppRole, type AuthContextValue, type SignUpDetails, type UserProfile } from './AuthContext'

function isAppRole(value: unknown): value is AppRole {
  return value === 'fan' || value === 'admin' || value === 'superadmin'
}

function readProfile(data: Record<string, unknown> | undefined): UserProfile | null {
  if (!data || !isAppRole(data.role)) return null
  return {
    role: data.role,
    email: typeof data.email === 'string' ? data.email : '',
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    phone: typeof data.phone === 'string' ? data.phone : null,
    legacyFanDocId: typeof data.legacyFanDocId === 'string' ? data.legacyFanDocId : null,
    legacyFanId: typeof data.legacyFanId === 'string' ? data.legacyFanId : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRequest = useRef(0)

  useEffect(() => {
    let mounted = true
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const requestId = ++profileRequest.current
      if (!mounted) return
      setUser(nextUser)
      if (!nextUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const snapshot = await getDoc(doc(db, 'users', nextUser.uid))
        if (mounted && requestId === profileRequest.current) {
          setProfile(readProfile(snapshot.data()))
        }
      } catch {
        if (mounted && requestId === profileRequest.current) setProfile(null)
      } finally {
        if (mounted && requestId === profileRequest.current) setLoading(false)
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  }, [])

  const signUp = useCallback(async ({ fullName, phone, email: rawEmail, password }: SignUpDetails) => {
    const email = rawEmail.trim().toLowerCase()
    const credential = await createUserWithEmailAndPassword(auth, email, password)

    try {
      await credential.user.getIdToken(true)
      const matchingFans = await getDocs(query(collection(db, 'fans'), where('email', '==', email)))
      const legacyFan = matchingFans.docs[0]
      const legacyData = legacyFan?.data()
      const nextProfile: UserProfile = {
        role: 'fan',
        email,
        fullName: fullName.trim() || (typeof legacyData?.fullName === 'string' ? legacyData.fullName : ''),
        phone: phone.trim() || (typeof legacyData?.phone === 'string' ? legacyData.phone : null),
        legacyFanDocId: legacyFan?.id ?? null,
        legacyFanId: typeof legacyData?.fanId === 'string' ? legacyData.fanId : null,
      }

      await setDoc(doc(db, 'users', credential.user.uid), {
        ...nextProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      profileRequest.current += 1
      setUser(credential.user)
      setProfile(nextProfile)
      setLoading(false)
    } catch (error) {
      await deleteUser(credential.user).catch(() => undefined)
      throw error
    }
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const role = profile?.role ?? null
  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    role,
    loading,
    signIn,
    signUp,
    sendPasswordReset,
    signOut,
  }), [user, profile, role, loading, signIn, signUp, sendPasswordReset, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}