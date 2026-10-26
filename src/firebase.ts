import { getApp, getApps, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { config } from './config'
import { browserLocalPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'

// On Firebase Hosting (web.app / firebaseapp.com) the sign-in helper pages are
// served from the same address as the app, so use that address for sign-in.
// This keeps Google sign-in on the domain the fan already reached, avoiding
// networks that block one of the two Firebase domains.
function pickAuthDomain() {
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return host
  return config.firebase.authDomain
}

const firebaseConfig = config.useEmulators ? { ...config.firebase, apiKey: config.firebase.apiKey || 'demo-key', projectId: 'demo-ekhaya', authDomain: 'localhost' } : {
  ...config.firebase,
  authDomain: pickAuthDomain(),
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// App Check: every request to the database carries a pass proving it comes
// from the real Ekhaya FC app (website or the Android app, which opens the
// website), so robots and copied apps can be refused. Only on the club's own
// addresses, the ones the reCAPTCHA key is registered for.
const APP_CHECK_SITE_KEY = '6LeG8QEuAAAAAPts1rvQ-W0ofkVjnTYUaI3pcDtt'
if (typeof window !== 'undefined' && !config.useEmulators && /(^|\.)ekhaya-fc-app\.(web\.app|firebaseapp\.com)$/.test(window.location.hostname)) {
  try {
    initializeAppCheck(firebaseApp, { provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true })
  } catch { /* the app still works; the database decides once App Check is enforced */ }
}
// Email sign-in only: getAuth() would also load the Google sign-in machinery
// (a hidden page from the auth domain) on every start, which is slow on weak
// connections. Google sign-in passes its helper in when it is used.
function createAuth(): Auth {
  try {
    return initializeAuth(firebaseApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  } catch {
    return getAuth(firebaseApp)
  }
}

export const auth = createAuth()
// Keep a copy of everything fans have seen on the phone, so the app still shows
// fixtures, results, the table, squad and news when the connection drops, and
// sends votes/predictions made offline once it is back. Falls back to the normal
// (memory-only) mode where the browser cannot store data (e.g. private mode).
function createDb(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return getFirestore(firebaseApp)
  }
}

export const db = createDb()

// Local development against the emulators (docker compose up, or npm run emulators).
if (config.useEmulators) {
  const host = window.location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
}
