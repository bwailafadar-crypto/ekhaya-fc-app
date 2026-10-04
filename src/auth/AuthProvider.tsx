import { browserLocalPersistence, createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect, type User, deleteUser, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocFromCache, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
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
    disabled: data.disabled === true,
  }
}

// Phones and installed apps sign in within the same tab: pop-up tabs on
// mobile browsers often fail to hand the result back to the app.
function prefersRedirect() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  return standalone || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}


// Signed-in account without a profile (first Google sign-in, or a profile a
// superadmin deleted): create a fresh fan profile the same way sign-up does.
// Firestore rules only allow role 'fan' here, so nobody can make themselves admin.
async function createGoogleProfile(user: User): Promise<UserProfile> {
  const email = (user.email ?? '').trim().toLowerCase()
  let legacyFanDocId: string | null = null
  let legacyFanId: string | null = null
  let legacyName = ''
  let legacyPhone: string | null = null
  try {
    const matchingFans = await getDocs(query(collection(db, 'fans'), where('email', '==', email)))
    const legacyFan = matchingFans.docs[0]
    const legacyData = legacyFan?.data()
    legacyFanDocId = legacyFan?.id ?? null
    legacyFanId = typeof legacyData?.fanId === 'string' ? legacyData.fanId : null
    legacyName = typeof legacyData?.fullName === 'string' ? legacyData.fullName : ''
    legacyPhone = typeof legacyData?.phone === 'string' ? legacyData.phone : null
  } catch {
    // An old fan record is optional; carry on without it.
  }
  const profile: UserProfile = {
    role: 'fan',
    email: user.email ?? email,
    fullName: (user.displayName ?? '').trim().slice(0, 120) || legacyName || (user.email ?? '').split('@')[0].slice(0, 120),
    phone: legacyPhone,
    legacyFanDocId,
    legacyFanId,
    disabled: false,
  }
  const { disabled: _disabled, ...stored } = profile
  void _disabled
  await setDoc(doc(db, 'users', user.uid), { ...stored, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accountBlocked, setAccountBlocked] = useState(false)
  const [googleError, setGoogleError] = useState<unknown>(null)
  const profileRequest = useRef(0)
  // True while email sign-up is writing its own profile, so the auth listener
  // does not create a second one at the same moment.
  const signingUp = useRef(false)

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    void setPersistence(auth, browserLocalPersistence)
      .then(() => {
        if (!mounted) return
        // Finishes a Google sign-in that had to use a full-page redirect.
        // Finishes a Google sign-in that used a full-page redirect and
        // keeps any error so the sign-in page can show it.
        void getRedirectResult(auth).catch((error: unknown) => { if (mounted) setGoogleError(error) })
        unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
          const requestId = ++profileRequest.current
          if (!mounted) return
          setUser(nextUser)
          setEmailVerified(Boolean(nextUser?.emailVerified))
          if (!nextUser) {
            setProfile(null)
            setLoading(false)
            return
          }

          // Show the app straight away from the profile saved on this phone,
          // then confirm with the server in the background.
          let shownFromCache = false
          try {
            const cached = await getDocFromCache(doc(db, 'users', nextUser.uid))
            const cachedProfile = readProfile(cached.data())
            if (cachedProfile && !cachedProfile.disabled && mounted && requestId === profileRequest.current) {
              setProfile(cachedProfile)
              setLoading(false)
              shownFromCache = true
            }
          } catch {
            // Nothing saved yet (first sign-in on this device).
          }
          if (!shownFromCache) setLoading(true)
          try {
            const snapshot = await getDoc(doc(db, 'users', nextUser.uid))
            let nextProfile = readProfile(snapshot.data())
            if (!snapshot.exists() && !signingUp.current) nextProfile = await createGoogleProfile(nextUser)
            if (nextProfile?.disabled) {
              await firebaseSignOut(auth)
              if (mounted) setAccountBlocked(true)
              return
            }
            if (mounted && requestId === profileRequest.current) {
              setAccountBlocked(false)
              setProfile(nextProfile)
            }
          } catch {
            if (mounted && requestId === profileRequest.current && !shownFromCache) setProfile(null)
          } finally {
            if (mounted && requestId === profileRequest.current) setLoading(false)
          }
        })
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setGoogleError(null)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    if (prefersRedirect()) {
      await signInWithRedirect(auth, provider)
      return
    }
    try {
      await signInWithPopup(auth, provider)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/network-request-failed') {
        await signInWithRedirect(auth, provider)
        return
      }
      throw error
    }
  }, [])

  const signUp = useCallback(async ({ fullName, phone, email: rawEmail, password }: SignUpDetails) => {
    const email = rawEmail.trim().toLowerCase()
    signingUp.current = true
    try {
      return await finishSignUp(email)
    } finally {
      signingUp.current = false
    }

    async function finishSignUp(email: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password)

    let nextProfile: UserProfile
    try {
      await credential.user.getIdToken(true)
      const matchingFans = await getDocs(query(collection(db, 'fans'), where('email', '==', email)))
      const legacyFan = matchingFans.docs[0]
      const legacyData = legacyFan?.data()
      nextProfile = {
        role: 'fan',
        email,
        fullName: fullName.trim() || (typeof legacyData?.fullName === 'string' ? legacyData.fullName : ''),
        phone: phone.trim() || (typeof legacyData?.phone === 'string' ? legacyData.phone : null),
        legacyFanDocId: legacyFan?.id ?? null,
        legacyFanId: typeof legacyData?.fanId === 'string' ? legacyData.fanId : null,
        disabled: false,
      }

      const { disabled: _disabled, ...stored } = nextProfile
      void _disabled
      await setDoc(doc(db, 'users', credential.user.uid), {
        ...stored,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      await deleteUser(credential.user).catch(() => undefined)
      throw error
    }

    let verificationSent = true
    try {
      await sendEmailVerification(credential.user)
    } catch {
      verificationSent = false
    }

    profileRequest.current += 1
    setUser(credential.user)
    setProfile(nextProfile)
    setEmailVerified(credential.user.emailVerified)
    setLoading(false)
    return verificationSent
    }
  }, [])

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase())
  }, [])

  const sendVerificationEmail = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser) throw new Error('Please sign in again to resend the verification email.')
    await sendEmailVerification(currentUser)
  }, [])

  const refreshEmailVerification = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return false
    await reload(currentUser)
    setEmailVerified(currentUser.emailVerified)
    setUser(currentUser)
    return currentUser.emailVerified
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const role = profile?.role ?? null
  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    role,
    emailVerified,
    loading,
    accountBlocked,
    googleError,
    signIn,
    signUp,
    signInWithGoogle,
    sendPasswordReset,
    sendVerificationEmail,
    refreshEmailVerification,
    signOut,
  }), [user, profile, role, emailVerified, loading, accountBlocked, googleError, signIn, signUp, signInWithGoogle, sendPasswordReset, sendVerificationEmail, refreshEmailVerification, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}