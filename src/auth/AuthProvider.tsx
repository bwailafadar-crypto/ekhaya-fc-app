import { browserPopupRedirectResolver, createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect, type User, deleteUser, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
import { setLogUser } from '../utils/logger'
import { doc, getDoc, getDocFromCache, serverTimestamp, setDoc } from 'firebase/firestore'
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


// Names that look like the club or its staff are refused by the database.
function safeName(name: string) {
  const trimmed = name.slice(0, 120)
  return /(ekhaya|official|admin|club|management)/i.test(trimmed) ? 'Fan' : trimmed
}

// Signed-in account without a profile (first Google sign-in, or a profile a
// superadmin deleted): create a fresh fan profile the same way sign-up does.
// Firestore rules only allow role 'fan' here, so nobody can make themselves admin.
async function createGoogleProfile(user: User): Promise<UserProfile> {
  const email = (user.email ?? '').trim().toLowerCase()
  // Old member records are linked by the club, never automatically at sign-up
  // (the email may not be verified yet).
  const profile: UserProfile = {
    role: 'fan',
    email: user.email ?? email,
    fullName: safeName((user.displayName ?? '').trim() || (user.email ?? '').split('@')[0]),
    phone: null,
    legacyFanDocId: null,
    legacyFanId: null,
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

    // Never wait forever on a slow connection: show the page after 6 seconds
    // and let sign-in finish in the background.
    const startupTimer = window.setTimeout(() => { if (mounted) setLoading(false) }, 6000)
    // Finishes a Google sign-in that used a full-page redirect (only when
    // Google sign-in is switched on) and keeps any error for the sign-in page.
    if (import.meta.env.VITE_ENABLE_GOOGLE_SIGNIN === 'true') {
      void getRedirectResult(auth, browserPopupRedirectResolver).catch((error: unknown) => { if (mounted) setGoogleError(error) })
    }
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      window.clearTimeout(startupTimer)
      const requestId = ++profileRequest.current
      if (!mounted) return
      setUser(nextUser)
      setLogUser(nextUser?.uid ?? null)
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
      // If the server is slow, stop showing the loading screen after 6 s;
      // the profile is applied as soon as it arrives.
      const slowTimer = shownFromCache ? undefined : window.setTimeout(() => {
        if (mounted && requestId === profileRequest.current) setLoading(false)
      }, 6000)
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
        window.clearTimeout(slowTimer)
        if (mounted && requestId === profileRequest.current) setLoading(false)
      }
    })

    return () => {
      mounted = false
      window.clearTimeout(startupTimer)
      unsubscribe()
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
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
      return
    }
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/network-request-failed') {
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver)
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
      nextProfile = {
        role: 'fan',
        email,
        fullName: fullName.trim().slice(0, 120),
        phone: phone.trim() || null,
        legacyFanDocId: null,
        legacyFanId: null,
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
    // Refresh the sign-in token too, so the database sees "verified" right away.
    if (currentUser.emailVerified) await currentUser.getIdToken(true)
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